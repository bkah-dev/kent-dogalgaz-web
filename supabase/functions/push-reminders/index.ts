// Kent Doğalgaz iş takip — bildirim gönderici (Supabase Edge Function).
//
// İki çağrı biçimi:
//   1. Zamanlayıcı (pg_cron → pg_net): header `x-cron-secret: <CRON_SECRET>`, body `{ "slot": "morning" | "evening", "dry": false }`
//      morning (08:00 TR): BUGÜN iş günü / Aksa randevusu / ödeme sözü / hatırlatması olan işler
//      evening (19:00 TR): YARIN  ... olan işler
//   2. Uygulamadan test: `Authorization: Bearer <kullanıcı JWT>`, body `{ "test": true, "endpoint": "<bu cihazın endpoint'i>" }`
//      → yalnızca o kullanıcıya (verilmişse yalnızca o cihaza) "Bildirimler çalışıyor" mesajı.
//
// Kimler ne alır: admin → hepsi; staff → yalnızca kendi adının geçtiği ustaya ait iş günü bildirimleri.
// Aynı gün + aynı dilim + aynı iş + aynı kişi için ikinci kez gönderilmez (push_log unique index).
// Ortam değişkenleri: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), APP_ORIGIN (ops.)

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { sendWebPush } from "../_shared/webpush.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://kentmekanikdogalgaz.com";
const VAPID = {
  publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
  subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@kentmekanikdogalgaz.com",
};
const TZ = "Europe/Istanbul";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Job = {
  id: string; job_no: number; customer_name: string; district: string; crew: string; plan_note: string;
  planned_at: string | null; appointment_at: string | null; reminder_at: string | null; reminder_note: string;
  remaining: number | string; status: string;
};
type Item = { kind: "plan" | "appt" | "pay" | "reminder"; job: Job; title: string; body: string; tpl: string };
type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };
type Member = { user_id: string; display_name: string; role: string };

const trDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const trTime = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const trNum = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

function dayStr(d: Date): string { return trDay.format(d); } // YYYY-MM-DD (en-CA biçimi)
function plusDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400000); }
function trHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d));
}
function norm(s: string): string { return (s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }

// Usta adı eşleşmesi: personelin adının ilk kelimesi işin usta alanında geçiyorsa.
function crewMatches(crew: string, displayName: string): boolean {
  const first = norm(displayName).split(/\s+/)[0];
  if (!first || first.length < 3) return false;
  return norm(crew).split(/[\s,/+&]+/).includes(first);
}

function buildItems(jobs: Job[], day: string, label: string): Item[] {
  const items: Item[] = [];
  for (const j of jobs) {
    if (j.status === "cancelled") continue;
    const name = j.customer_name;
    const where = (j.district || "").trim();
    if (j.status === "open" && j.planned_at === day) {
      const bits = [where, j.crew?.trim() ? `Usta: ${j.crew.trim()}` : "Usta atanmadı", j.plan_note?.trim()].filter(Boolean);
      items.push({ kind: "plan", job: j, tpl: "montaj", title: `${label} iş günü: ${name}`, body: bits.join(" · ") });
    }
    if (j.status === "open" && j.appointment_at && dayStr(new Date(j.appointment_at)) === day) {
      const bits = [trTime.format(new Date(j.appointment_at)), where].filter(Boolean);
      items.push({ kind: "appt", job: j, tpl: "randevu", title: `${label} Aksa randevusu: ${name}`, body: bits.join(" · ") });
    }
    if (j.reminder_at === day) {
      const remaining = Number(j.remaining) || 0;
      if (remaining > 0) {
        const bits = [`Kalan ${trNum.format(remaining)} ₺`, j.reminder_note?.trim()].filter(Boolean);
        items.push({ kind: "pay", job: j, tpl: "odeme", title: `${label} ödeme sözü: ${name}`, body: bits.join(" · ") });
      } else if (j.status === "open") {
        items.push({ kind: "reminder", job: j, tpl: "", title: `${label} hatırlatma: ${name}`, body: j.reminder_note?.trim() || where });
      }
    }
  }
  return items;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function deliver(db: ReturnType<typeof createClient>, subs: Sub[], payload: Record<string, unknown>) {
  const out = { sent: 0, failed: 0, gone: 0, errors: [] as string[] };
  const dead: number[] = [];
  for (const s of subs) {
    try {
      const r = await sendWebPush({ subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, vapid: VAPID, ttl: 12 * 3600 });
      if (r.ok) out.sent++;
      else if (r.gone) { out.gone++; dead.push(s.id); }
      else { out.failed++; out.errors.push(`${r.status} ${r.text}`.slice(0, 200)); }
    } catch (e) {
      out.failed++; out.errors.push(String(e).slice(0, 200));
    }
  }
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);
  if (!VAPID.publicKey || !VAPID.privateKey) return json({ error: "VAPID anahtarları tanımlı değil" }, 500);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const now = new Date();
  const today = dayStr(now);

  // --- 2. Uygulamadan test ------------------------------------------------
  if (body.test === true) {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Giriş gerekli" }, 401);
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: "Oturum geçersiz" }, 401);
    const uid = userData.user.id;
    const { data: member } = await db.from("staff_members").select("user_id,display_name").eq("user_id", uid).maybeSingle();
    if (!member) return json({ error: "Personel değil" }, 403);
    let q = db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", uid);
    if (typeof body.endpoint === "string" && body.endpoint) q = q.eq("endpoint", body.endpoint);
    const { data: subs } = await q;
    if (!subs?.length) return json({ error: "Bu cihaz için abonelik bulunamadı" }, 404);
    const payload = { title: "Kent İş · Test", body: `Bildirimler çalışıyor ✓ (${member.display_name || "personel"})`, url: `${APP_ORIGIN}/admin`, tag: "test" };
    const r = await deliver(db, subs as Sub[], payload);
    await db.from("push_log").insert({ sent_on: today, slot: "test", kind: "test", user_id: uid, title: payload.title, body: payload.body, status: r.sent ? "sent" : r.gone ? "gone" : "failed", error: r.errors.join(" | ") });
    return json({ ok: r.sent > 0, ...r });
  }

  // --- 1. Zamanlayıcı -------------------------------------------------------
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Yetkisiz" }, 401);
  const slot = body.slot === "morning" || body.slot === "evening" ? body.slot : (trHour(now) < 12 ? "morning" : "evening");
  const dry = body.dry === true;
  const targetDay = slot === "morning" ? today : dayStr(plusDays(now, 1));
  const label = slot === "morning" ? "Bugün" : "Yarın";

  const [{ data: jobs, error: jobsErr }, { data: members }, { data: subs }, { data: logged }] = await Promise.all([
    db.from("jobs_view").select("id,job_no,customer_name,district,crew,plan_note,planned_at,appointment_at,reminder_at,reminder_note,remaining,status").neq("status", "cancelled").limit(2000),
    db.from("staff_members").select("user_id,display_name,role"),
    db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth"),
    db.from("push_log").select("kind,job_id,user_id").eq("sent_on", today).eq("slot", slot).eq("status", "sent"),
  ]);
  if (jobsErr) return json({ error: jobsErr.message }, 500);

  const items = buildItems((jobs || []) as Job[], targetDay, label);
  const done = new Set((logged || []).map((l) => `${l.kind}:${l.job_id}:${l.user_id}`));
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  const plan: { member: Member; item: Item; subs: Sub[] }[] = [];
  for (const m of (members || []) as Member[]) {
    const mySubs = byUser.get(m.user_id) || [];
    if (!mySubs.length) continue;
    for (const it of items) {
      const allowed = m.role === "admin" || (it.kind === "plan" && crewMatches(it.job.crew, m.display_name));
      if (!allowed) continue;
      if (done.has(`${it.kind}:${it.job.id}:${m.user_id}`)) continue;
      plan.push({ member: m, item: it, subs: mySubs });
    }
  }

  if (dry) {
    return json({ slot, targetDay, items: items.map((i) => ({ kind: i.kind, job_no: i.job.job_no, title: i.title, body: i.body })), recipients: plan.map((p) => `${p.member.display_name}: ${p.item.title}`) });
  }

  const totals = { sent: 0, failed: 0, gone: 0 };
  const badgeByUser = new Map<string, number>();
  for (const p of plan) badgeByUser.set(p.member.user_id, (badgeByUser.get(p.member.user_id) || 0) + 1);

  for (const p of plan) {
    const payload = {
      title: p.item.title, body: p.item.body,
      url: `${APP_ORIGIN}/admin?job=${p.item.job.id}${p.item.tpl ? `&tpl=${p.item.tpl}` : ""}`,
      job: p.item.job.id, tpl: p.item.tpl || null, tag: `${p.item.kind}-${p.item.job.id}`,
      badge: badgeByUser.get(p.member.user_id) || 1,
    };
    const r = await deliver(db, p.subs, payload);
    totals.sent += r.sent; totals.failed += r.failed; totals.gone += r.gone;
    await db.from("push_log").upsert({
      sent_on: today, slot, kind: p.item.kind, job_id: p.item.job.id, user_id: p.member.user_id,
      title: payload.title, body: payload.body,
      status: r.sent ? "sent" : r.gone ? "gone" : "failed", error: r.errors.join(" | ").slice(0, 500),
    }, { onConflict: "sent_on,slot,kind,job_id,user_id", ignoreDuplicates: true });
  }

  return json({ slot, targetDay, items: items.length, planned: plan.length, ...totals });
});
