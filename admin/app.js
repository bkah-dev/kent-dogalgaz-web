const STAFF_EMAIL_SUFFIX = "@personel.kentmekanikdogalgaz.com";
const FILTER_KEY = "kent-is-filter";
const SORT_KEY = "kent-is-sort";
const MONEY_MODE_KEY = "kent-para-mod";
const MONEY_STATUS_KEY = "kent-para-durum";
const DISTRICT_KEY = "kent-ilce";
const LAST_DISTRICT_KEY = "kent-son-ilce";
const EXCEL_TAG = "[Excel #";
const WARN_DAYS = 7;
const FILE_BUCKET = "job-files";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1600;
const IMAGE_QUALITY = 0.82;
const config = window.KENT_SUPABASE_CONFIG;

const KIND_LABELS = { sozlesme: "Sözleşme", abone_formu: "Abone formu", video: "Montaj videosu", barkod: "Kombi barkodu", proje: "Proje", diger: "Diğer" };
const KIND_TO_CHECK = { sozlesme: "sozlesme_foto", abone_formu: "abone_formu", barkod: "barkod", proje: "proje" };

// Müşteriye WhatsApp ile gönderilecek hazır mesajlar. {ad} {tarih} {kalan} alanları doldurulur.
const MESSAGE_TEMPLATES = [
  { key: "kesif", title: "Keşif sonrası takip", hint: "Teklif verildi, karar bekleniyor",
    text: "Merhaba {ad}, Kent Doğalgaz. Keşif sonrası ilettiğimiz teklif hakkında karar verdiyseniz bize dönebilirsiniz. Sorularınız için her zaman buradayız. İyi günler." },
  { key: "sayac", title: "Proje onaylandı, sayaç alın", hint: "Aksa onayından sonra",
    text: "Merhaba {ad}, Kent Doğalgaz. Doğalgaz projeniz Aksa tarafından onaylandı. Sayacınızı alabilirsiniz; aldığınızda bize haber verin, gaz açma randevusu için işlemleri başlatalım." },
  { key: "randevu", title: "Randevu bilgisi", hint: "Aksa randevu günü",
    text: "Merhaba {ad}, Kent Doğalgaz. Aksa gaz açma randevunuz {tarih} tarihinde. O gün evde bulunmanız gerekiyor. Sorunuz olursa arayabilirsiniz." },
  { key: "odeme", title: "Kalan ödeme hatırlatma", hint: "Kalan tutar otomatik eklenir",
    text: "Merhaba {ad}, Kent Doğalgaz. Kalan {kalan} ödemenizi hatırlatmak istedik. Uygun olduğunuzda bize dönebilirsiniz. Teşekkür ederiz." },
  { key: "bos", title: "Boş mesaj", hint: "Sadece sohbeti açar", text: "" },
];

const state = {
  user: null,
  member: null,
  stages: [],
  checkItems: [],
  jobs: [],
  events: [],
  checks: [],
  payments: [],
  files: [],
  filter: localStorage.getItem(FILTER_KEY) || "open",
  search: "",
  sort: localStorage.getItem(SORT_KEY) || "updated",
  returnView: "list",
  moneyMode: localStorage.getItem(MONEY_MODE_KEY) || "debt",
  moneyStatus: localStorage.getItem(MONEY_STATUS_KEY) || "open",
  moneySearch: "",
  district: localStorage.getItem(DISTRICT_KEY) || "all",
  summary: null,
  skipPop: false,
  activeJobId: null,
  editingJobId: null,
  fileKind: "sozlesme",
  channel: null,
  reloadTimer: null,
};

const el = Object.fromEntries([
  "authGate", "loginForm", "loginUsername", "loginPassword", "loginError", "loginButton",
  "app", "listView", "detailView", "staffName", "stagesButton", "logoutButton",
  "searchInput", "sortSelect", "stageChips", "districtChips", "syncStatus", "jobList", "emptyState", "newJobButton",
  "moneyButton", "moneyView", "moneyBack", "moneyShare", "moneySearch", "moneyMode", "moneyStatus", "moneyDistrict", "moneySummary", "moneyCount", "moneyList", "moneyEmpty",
  "summaryButton", "summaryView", "summaryBack", "summaryNow", "summaryStatus", "summaryTable", "summaryPipeline", "summaryHygiene",
  "backButton", "detailTitle", "detailNo", "editJobButton", "callLink", "waLink", "mapLink",
  "detailAddress", "detailNote", "alertStrip", "stageCard", "stageName", "stageSince", "statusBanner",
  "nextStageButton", "pickStageButton",
  "secChecks", "checksSummary", "checklist",
  "secPay", "paySummary", "priceInput", "savePriceButton", "paidTotal", "remainingTotal",
  "payAmount", "payMethod", "payDate", "addPaymentButton", "paymentList", "reminderInput", "reminderNote", "saveReminderButton",
  "secFiles", "filesSummary", "fileKinds", "cameraInput", "fileInput", "uploadStatus", "fileList",
  "secDates", "datesSummary", "plannedInput", "savePlannedButton", "appointmentInput", "saveAppointmentButton",
  "appointmentResult", "apptOpenedButton", "apptFailedButton",
  "secMsg", "messageButtons",
  "noteInput", "addNoteButton", "timeline", "cancelJobButton", "reopenJobButton",
  "overlay", "jobDialog", "jobDialogTitle", "fName", "fPhone", "fDistrict", "fAddress", "fNote",
  "fStageWrap", "fStage", "jobDialogError", "jobDialogCancel", "jobDialogSave",
  "stagePicker", "stagePickerList", "stagePickerCancel",
  "stagesDialog", "stagesList", "checkItemsList", "stagesClose", "toast"
].map((id) => [id, document.getElementById(id)]));

const db = window.supabase.createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const shortDateFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dayShortFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" });
const monthFmt = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" });
const numberFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const money = { format: (n) => numberFmt.format(Number(n) || 0) + " ₺" };

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function normalizeText(value) {
  return (value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function daysLabel(iso) {
  const d = daysSince(iso);
  if (d <= 0) return "bugün";
  if (d === 1) return "1 gün";
  return `${d} gün`;
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isDueDate(dateStr) {
  return Boolean(dateStr) && dateStr <= todayStr();
}

function isAppointmentDue(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now() + 86400000;
}

function phoneDigits(phone) {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d;
}

// "5321112233" / "05321112233" / "+905321112233" → "0532 111 22 33"; tanınmazsa olduğu gibi bırakır.
function prettyPhone(phone) {
  const d = phoneDigits(phone);
  if (d.length !== 10 || !d.startsWith("5")) return (phone || "").trim();
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

function isExcelImport(job) {
  return (job.note || "").includes(EXCEL_TAG);
}

function districtOf(job) {
  return (job.district || "").trim() || "Belirsiz";
}

function monthKey(dateLike) {
  const d = typeof dateLike === "string" && dateLike.length === 10 ? new Date(dateLike + "T00:00") : new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function phoneHref(phone) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

function whatsappHref(phone, text = "") {
  const d = phoneDigits(phone);
  if (d.length !== 10) return "";
  return `https://wa.me/90${d}${text ? "?text=" + encodeURIComponent(text) : ""}`;
}

function mapsHref(job) {
  const q = [job.address, job.district].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fillTemplate(text, job) {
  const first = (job.customer_name || "").trim().split(/\s+/)[0] || "";
  const tarih = job.appointment_at ? dateFmt.format(new Date(job.appointment_at)) : "…";
  return text.replace(/\{ad\}/g, first ? first + " Bey/Hanım" : "").replace(/\{tarih\}/g, tarih).replace(/\{kalan\}/g, money.format(job.remaining || 0));
}

let toastTimer = null;
function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle("error", isError);
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, isError ? 4000 : 2200);
}

function friendlyError(error) {
  const msg = error?.message || String(error);
  if (/Invalid login credentials/i.test(msg)) return "Kullanıcı adı veya parola hatalı.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Bağlantı yok. İnterneti kontrol edin.";
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return "Dosya çok büyük (en fazla 50 MB).";
  return msg.replace(/^.*?exception:\s*/i, "");
}

function stageById(id) {
  return state.stages.find((s) => s.id === id) || null;
}

function activeStages() {
  return state.stages.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

function activeCheckItems() {
  return state.checkItems.filter((i) => i.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

function nextStage(currentId) {
  const list = activeStages();
  const idx = list.findIndex((s) => s.id === currentId);
  if (idx === -1) return list[0] || null;
  return list[idx + 1] || null;
}

function activeJob() {
  return state.jobs.find((j) => j.id === state.activeJobId) || null;
}

function anySheetOpen() {
  return [el.jobDialog, el.stagePicker, el.stagesDialog].some((s) => !s.hidden);
}

// Alt pencere açılınca geçmişe bir adım eklenir; telefonun geri tuşu önce pencereyi kapatır.
function openSheet(sheet) {
  if (!anySheetOpen()) history.pushState({ ...(history.state || {}), sheet: true }, "");
  el.overlay.hidden = false;
  sheet.hidden = false;
}

// Pencereyi kapatır ve eklenen geçmiş adımını geri alır; geri alma bitince çözülür (sonrasında pushState güvenli).
function closeSheets() {
  const wasOpen = anySheetOpen();
  el.overlay.hidden = true;
  [el.jobDialog, el.stagePicker, el.stagesDialog].forEach((s) => { s.hidden = true; });
  if (!(wasOpen && history.state?.sheet)) return Promise.resolve();
  state.skipPop = true;
  return new Promise((resolve) => {
    state.popResolve = resolve;
    setTimeout(resolve, 400);
    history.back();
  });
}

async function rpc(name, params) {
  const { data, error } = await db.rpc(name, params);
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Veri yükleme
// ---------------------------------------------------------------------------
async function loadStages() {
  const [{ data: stages, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    db.from("job_stages").select("*").order("sort_order"),
    db.from("checklist_items").select("*").order("sort_order"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  state.stages = stages || [];
  state.checkItems = items || [];
}

async function loadJobs() {
  el.syncStatus.textContent = "Yükleniyor…";
  const { data, error } = await db.from("jobs_view").select("*").order("updated_at", { ascending: false }).limit(1000);
  if (error) { el.syncStatus.textContent = "Liste alınamadı: " + friendlyError(error); throw error; }
  state.jobs = data || [];
  el.syncStatus.textContent = "";
  renderChips();
  renderList();
  if (!el.moneyView.hidden) renderMoney();
  if (state.activeJobId) renderDetail();
}

async function loadJobExtras(jobId) {
  const [ev, ch, pay, fi] = await Promise.all([
    db.from("job_events_view").select("*").eq("job_id", jobId).order("created_at", { ascending: false }).limit(300),
    db.from("job_checks").select("item_id,done_at,done_by").eq("job_id", jobId),
    db.from("payments").select("*").eq("job_id", jobId).order("paid_at", { ascending: false }).order("id", { ascending: false }),
    db.from("job_files").select("*").eq("job_id", jobId).order("created_at", { ascending: false }),
  ]);
  const err = ev.error || ch.error || pay.error || fi.error;
  if (err) throw err;
  state.events = ev.data || [];
  state.checks = ch.data || [];
  state.payments = pay.data || [];
  state.files = fi.data || [];
}

async function refreshDetail() {
  await loadJobs();
  if (!state.activeJobId) return;
  await loadJobExtras(state.activeJobId);
  renderDetail();
  renderExtras();
}

function scheduleReload() {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(() => loadJobs().catch(() => {}), 400);
}

function subscribeRealtime() {
  if (state.channel) return;
  state.channel = db
    .channel("jobs-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "job_checks" }, scheduleReload)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
function isTodayJob(job) {
  if (job.status !== "open") return false;
  return isAppointmentDue(job.appointment_at) || isDueDate(job.reminder_at) || job.planned_at === todayStr();
}

function filteredJobs() {
  const q = normalizeText(state.search.trim());
  return state.jobs.filter((job) => {
    if (state.district !== "all" && districtOf(job) !== state.district) return false;
    if (state.filter === "open" && job.status !== "open") return false;
    if (state.filter === "closed" && job.status === "open") return false;
    if (state.filter === "today" && !isTodayJob(job)) return false;
    if (state.filter === "money" && !(Number(job.remaining) > 0 && job.status !== "cancelled")) return false;
    if (/^stage:/.test(state.filter)) {
      if (job.status !== "open" || String(job.stage_id) !== state.filter.slice(6)) return false;
    }
    if (!q) return true;
    const hay = normalizeText(`${job.customer_name} ${job.phone} ${job.address} ${job.district} ${job.note} #${job.job_no}`);
    return hay.includes(q);
  }).sort(jobComparator(state.sort));
}

function jobComparator(sort) {
  const byName = (a, b) => a.customer_name.localeCompare(b.customer_name, "tr");
  const time = (iso) => (iso ? new Date(iso).getTime() : 0);
  switch (sort) {
    case "waiting": return (a, b) => time(a.stage_changed_at) - time(b.stage_changed_at) || byName(a, b);
    case "remaining": return (a, b) => (Number(b.remaining) || 0) - (Number(a.remaining) || 0) || byName(a, b);
    case "name": return byName;
    case "newest": return (a, b) => time(b.created_at) - time(a.created_at);
    default: return (a, b) => time(b.updated_at) - time(a.updated_at);
  }
}

// İlçe çipleri: birden fazla ilçe varsa görünür; seçim ana liste ve kalan listesi için ortaktır.
function renderDistrictChips() {
  const counts = new Map();
  state.jobs.filter((j) => j.status !== "cancelled").forEach((j) => counts.set(districtOf(j), (counts.get(districtOf(j)) || 0) + 1));
  const districts = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  const show = districts.length > 1;
  if (!show || !districts.some(([d]) => d === state.district)) {
    if (state.district !== "all") { state.district = "all"; localStorage.setItem(DISTRICT_KEY, "all"); }
  }
  const html = show
    ? [["all", "Tüm ilçeler", state.jobs.filter((j) => j.status !== "cancelled").length], ...districts.map(([d, n]) => [d, d, n])]
      .map(([key, label, count]) => `<button type="button" class="chip${state.district === key ? " active" : ""}" data-district="${escapeHtml(key)}">${escapeHtml(label || key)}<span class="count">${count}</span></button>`)
      .join("")
    : "";
  [el.districtChips, el.moneyDistrict].forEach((box) => { box.innerHTML = html; box.hidden = !show; });
}

function renderChips() {
  renderDistrictChips();
  const open = state.jobs.filter((j) => j.status === "open");
  const closed = state.jobs.length - open.length;
  const chips = [
    { key: "open", label: "Açık işler", count: open.length, always: true },
    { key: "today", label: "Bugün", count: state.jobs.filter(isTodayJob).length },
    { key: "money", label: "Kalan ödeme", count: state.jobs.filter((j) => Number(j.remaining) > 0 && j.status !== "cancelled").length },
    ...activeStages()
      .filter((s) => !s.is_terminal)
      .map((s) => ({ key: `stage:${s.id}`, label: s.short_name || s.name, count: open.filter((j) => j.stage_id === s.id).length })),
    { key: "closed", label: "Biten / iptal", count: closed, always: true },
  ].filter((c) => c.always || c.count > 0);
  if (!chips.some((c) => c.key === state.filter)) {
    state.filter = "open";
    localStorage.setItem(FILTER_KEY, state.filter);
  }
  el.stageChips.innerHTML = chips
    .map((c) => `<button type="button" class="chip${state.filter === c.key ? " active" : ""}" data-filter="${c.key}">${escapeHtml(c.label)}<span class="count">${c.count}</span></button>`)
    .join("");
}

function renderList() {
  const jobs = filteredJobs();
  el.emptyState.hidden = jobs.length > 0;
  el.jobList.innerHTML = jobs.map((job) => {
    const days = daysSince(job.stage_changed_at);
    const warn = job.status === "open" && !job.stage_is_terminal && days >= WARN_DAYS;
    const sub = [job.district, job.address].filter(Boolean).join(" · ") || job.phone || "—";
    const badges = [];
    if (job.appointment_at && job.status === "open") badges.push(`<span class="appt">📅 ${shortDateFmt.format(new Date(job.appointment_at))}</span>`);
    else if (job.planned_at && job.status === "open") badges.push(`<span class="appt">🔧 ${dayShortFmt.format(new Date(job.planned_at + "T00:00"))}</span>`);
    if (Number(job.remaining) > 0 && job.status !== "cancelled") badges.push(`<span class="days warn">💰 ${money.format(job.remaining)}</span>`);
    if (job.reminder_at && job.status === "open") badges.push(`<span class="days${isDueDate(job.reminder_at) ? " warn" : ""}">🔔 ${dayShortFmt.format(new Date(job.reminder_at + "T00:00"))}</span>`);
    const tel = phoneHref(job.phone);
    const noteLine = (job.note || "").replace(/\s*·?\s*\[Excel #\d+\]/, "").trim();
    return `
      <article class="job-card ${job.status}" data-id="${job.id}" style="border-left-color:${escapeHtml(job.stage_color)}">
        <div class="name">${escapeHtml(job.customer_name)} <small style="color:var(--muted);font-weight:600">#${job.job_no}</small></div>
        <div class="sub">${escapeHtml(sub)}</div>
        ${noteLine ? `<div class="sub note-line">${escapeHtml(noteLine)}</div>` : ""}
        <div class="meta">
          <span class="badge" style="background:${escapeHtml(job.stage_color)}">${escapeHtml(job.status === "cancelled" ? "İptal" : job.stage_short_name || job.stage_name)}</span>
          <span class="days${warn ? " warn" : ""}">${daysLabel(job.stage_changed_at)}</span>
          ${badges.join("")}
        </div>
        ${tel ? `<a class="call" href="${tel}" data-call aria-label="Ara">📞</a>` : ""}
      </article>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Kalan ödemeler listesi (tüm işler, toplamlarla)
// ---------------------------------------------------------------------------
function moneyJobs() {
  const q = normalizeText(state.moneySearch.trim());
  return state.jobs
    .filter((job) => {
      if (job.status === "cancelled") return false;
      if (state.district !== "all" && districtOf(job) !== state.district) return false;
      if (state.moneyStatus === "open" && job.status !== "open") return false;
      if (state.moneyStatus === "closed" && job.status !== "closed") return false;
      const remaining = Number(job.remaining) || 0;
      const price = Number(job.price) || 0;
      if (state.moneyMode === "debt" && !(remaining > 0)) return false;
      if (state.moneyMode === "due" && !(remaining > 0 && isDueDate(job.reminder_at))) return false;
      if (state.moneyMode === "paid" && !(price > 0 && remaining <= 0)) return false;
      if (!q) return true;
      return normalizeText(`${job.customer_name} ${job.phone} ${job.address} ${job.district} ${job.note} #${job.job_no}`).includes(q);
    })
    .sort((a, b) => (Number(b.remaining) || 0) - (Number(a.remaining) || 0) || a.customer_name.localeCompare(b.customer_name, "tr"));
}

function moneyTotals(jobs) {
  return jobs.reduce((t, j) => {
    t.price += Number(j.price) || 0;
    t.paid += Number(j.paid_total) || 0;
    t.remaining += Number(j.remaining) || 0;
    return t;
  }, { price: 0, paid: 0, remaining: 0 });
}

function renderMoney() {
  const jobs = moneyJobs();
  const t = moneyTotals(jobs);
  el.moneySummary.innerHTML = `
    <div class="money-tile"><span>Toplam fiyat</span><strong>${escapeHtml(money.format(t.price))}</strong></div>
    <div class="money-tile"><span>Ödenen</span><strong>${escapeHtml(money.format(t.paid))}</strong></div>
    <div class="money-tile kalan"><span>Kalan</span><strong>${escapeHtml(money.format(t.remaining))}</strong></div>`;
  const debtCount = jobs.filter((j) => Number(j.remaining) > 0).length;
  el.moneyCount.textContent = jobs.length
    ? `${jobs.length} iş${state.moneyMode === "all" ? ` · ${debtCount} tanesinde borç var` : ""}`
    : "";
  el.moneyMode.querySelectorAll("[data-mode]").forEach((c) => c.classList.toggle("active", c.dataset.mode === state.moneyMode));
  el.moneyStatus.querySelectorAll("[data-status]").forEach((c) => c.classList.toggle("active", c.dataset.status === state.moneyStatus));
  el.moneyEmpty.hidden = jobs.length > 0;
  el.moneyList.innerHTML = jobs.map((job) => {
    const price = Number(job.price) || 0;
    const remaining = Number(job.remaining) || 0;
    const sub = price > 0
      ? `Fiyat ${money.format(price)} · Ödenen ${money.format(job.paid_total || 0)}`
      : "Fiyat girilmedi";
    const right = price <= 0
      ? '<span class="mr-kalan none">—</span>'
      : remaining > 0
        ? `<span class="mr-kalan">${escapeHtml(money.format(remaining))}</span>`
        : '<span class="mr-kalan ok">✓ Ödendi</span>';
    const tel = phoneHref(job.phone);
    const wa = remaining > 0 ? whatsappHref(job.phone, fillTemplate(MESSAGE_TEMPLATES.find((t) => t.key === "odeme").text, job)) : "";
    const reminder = job.reminder_at ? `${isDueDate(job.reminder_at) ? "🔔 sözü geçti " : "🔔 "}${dayShortFmt.format(new Date(job.reminder_at + "T00:00"))}` : "";
    return `
      <article class="money-row" data-id="${job.id}" style="border-left-color:${escapeHtml(job.stage_color)}">
        <span class="mr-top">
          <span class="mr-name">${escapeHtml(job.customer_name)} <small>#${job.job_no}</small></span>
          ${right}
        </span>
        <span class="mr-sub">${escapeHtml(sub)}</span>
        <span class="mr-bottom">
          <span class="mr-sub${job.reminder_at && isDueDate(job.reminder_at) && remaining > 0 ? " due" : ""}">${escapeHtml([job.status === "closed" ? "Bitti" : job.stage_short_name || job.stage_name, job.district, reminder].filter(Boolean).join(" · "))}</span>
          <span class="mr-actions">
            ${tel ? `<a class="mr-act" href="${tel}" data-call title="Ara">📞</a>` : ""}
            ${wa ? `<a class="mr-act" href="${wa}" target="_blank" rel="noopener" data-call title="WhatsApp kalan ödeme mesajı">💬</a>` : ""}
          </span>
        </span>
      </article>`;
  }).join("");
}

function showView(view) {
  el.listView.hidden = view !== "list";
  el.moneyView.hidden = view !== "money";
  el.summaryView.hidden = view !== "summary";
  el.detailView.hidden = view !== "detail";
  window.scrollTo(0, 0);
}

function currentView() {
  if (!el.detailView.hidden) return "detail";
  if (!el.moneyView.hidden) return "money";
  if (!el.summaryView.hidden) return "summary";
  return "list";
}

function openMoney(pushHistory = true) {
  if (pushHistory) history.pushState({ view: "money" }, "");
  showView("money");
  renderMoney();
}

function closeMoney() {
  showView("list");
}

// ---------------------------------------------------------------------------
// Aylık özet: yeni iş, gaz açılan, tamamlanan, tahsilat (son 12 ay) + şu anki tablo
// ---------------------------------------------------------------------------
function monthsBack(n) {
  const out = [];
  const d = new Date(); d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

async function loadSummary() {
  const since = new Date(); since.setDate(1); since.setMonth(since.getMonth() - 11); since.setHours(0, 0, 0, 0);
  const sinceDay = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`;
  const [pay, ev] = await Promise.all([
    db.from("payments").select("amount,paid_at,note").gte("paid_at", sinceDay).limit(5000),
    db.from("job_events").select("to_stage_id,created_at,job_id").eq("kind", "stage").gte("created_at", since.toISOString()).limit(5000),
  ]);
  if (pay.error) throw pay.error;
  if (ev.error) throw ev.error;
  state.summary = { payments: pay.data || [], events: ev.data || [] };
}

function renderSummary() {
  const months = monthsBack(12);
  const rows = Object.fromEntries(months.map((m) => [m, { created: 0, gas: 0, done: 0, cash: 0 }]));
  const gasId = state.stages.find((s) => s.key === "gaz")?.id;
  const doneId = state.stages.find((s) => s.is_terminal && s.is_active)?.id;
  const importedIds = new Set(state.jobs.filter(isExcelImport).map((j) => j.id));

  state.jobs.filter((j) => !isExcelImport(j)).forEach((j) => { const k = monthKey(j.created_at); if (rows[k]) rows[k].created += 1; });
  (state.summary?.events || []).forEach((e) => {
    const k = monthKey(e.created_at);
    if (!rows[k]) return;
    if (e.to_stage_id === gasId) rows[k].gas += 1;
    if (e.to_stage_id === doneId) rows[k].done += 1;
  });
  (state.summary?.payments || []).forEach((p) => {
    if ((p.note || "").startsWith("Excel aktarımı")) return;
    const k = monthKey(p.paid_at);
    if (rows[k]) rows[k].cash += Number(p.amount) || 0;
  });

  const now = rows[months[0]];
  el.summaryNow.innerHTML = `
    <div class="money-tile"><span>Bu ay yeni iş</span><strong>${now.created}</strong></div>
    <div class="money-tile"><span>Bu ay gaz açılan</span><strong>${now.gas}</strong></div>
    <div class="money-tile kalan"><span>Bu ay tahsilat</span><strong>${escapeHtml(money.format(now.cash))}</strong></div>`;

  el.summaryTable.innerHTML = `
    <thead><tr><th>Ay</th><th>Yeni</th><th>Gaz</th><th>Bitti</th><th>Tahsilat</th></tr></thead>
    <tbody>${months.map((m) => {
      const r = rows[m];
      const label = monthFmt.format(new Date(m + "-01T00:00"));
      const empty = !r.created && !r.gas && !r.done && !r.cash;
      return `<tr class="${empty ? "empty" : ""}"><td>${escapeHtml(label)}</td><td>${r.created || "–"}</td><td>${r.gas || "–"}</td><td>${r.done || "–"}</td><td>${r.cash ? escapeHtml(money.format(r.cash)) : "–"}</td></tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td>12 ay</td><td>${months.reduce((s, m) => s + rows[m].created, 0)}</td><td>${months.reduce((s, m) => s + rows[m].gas, 0)}</td><td>${months.reduce((s, m) => s + rows[m].done, 0)}</td><td>${escapeHtml(money.format(months.reduce((s, m) => s + rows[m].cash, 0)))}</td></tr></tfoot>`;

  const open = state.jobs.filter((j) => j.status === "open");
  const max = Math.max(1, ...activeStages().map((s) => open.filter((j) => j.stage_id === s.id).length));
  el.summaryPipeline.innerHTML = activeStages().filter((s) => !s.is_terminal).map((s) => {
    const n = open.filter((j) => j.stage_id === s.id).length;
    const stale = open.filter((j) => j.stage_id === s.id && daysSince(j.stage_changed_at) >= WARN_DAYS).length;
    return `<div class="pipe-row">
      <span class="pipe-name">${escapeHtml(s.short_name || s.name)}</span>
      <span class="pipe-bar"><span style="width:${Math.round((n / max) * 100)}%;background:${escapeHtml(s.color)}"></span></span>
      <span class="pipe-n">${n}${stale ? `<small class="warn"> · ${stale} bekliyor</small>` : ""}</span>
    </div>`;
  }).join("");

  const noPrice = open.filter((j) => !(Number(j.price) > 0)).length;
  const noPhone = open.filter((j) => phoneDigits(j.phone).length !== 10).length;
  const debt = state.jobs.filter((j) => j.status !== "cancelled" && Number(j.remaining) > 0);
  const overdue = debt.filter((j) => isDueDate(j.reminder_at)).length;
  const stale = open.filter((j) => !j.stage_is_terminal && daysSince(j.stage_changed_at) >= WARN_DAYS).length;
  el.summaryHygiene.innerHTML = `
    <h3 class="card-title">Şu an</h3>
    <ul class="plain-list">
      <li>Açık iş <span class="meta">${open.length}</span></li>
      <li>Borcu olan iş <span class="meta">${debt.length} · ${escapeHtml(money.format(debt.reduce((s, j) => s + (Number(j.remaining) || 0), 0)))}</span></li>
      <li>Ödeme sözü geçmiş <span class="meta${overdue ? " warn" : ""}">${overdue}</span></li>
      <li>${WARN_DAYS} günden uzun aynı aşamada <span class="meta${stale ? " warn" : ""}">${stale}</span></li>
      <li>Fiyatı girilmemiş açık iş <span class="meta${noPrice ? " warn" : ""}">${noPrice}</span></li>
      <li>Telefonu eksik açık iş <span class="meta${noPhone ? " warn" : ""}">${noPhone}</span></li>
    </ul>
    ${importedIds.size ? `<p class="hint">${importedIds.size} iş Excel'den aktarıldı; aylık sayımlara girmez, "Şu an" bölümüne girer.</p>` : ""}`;
}

async function openSummary(pushHistory = true) {
  if (pushHistory) history.pushState({ view: "summary" }, "");
  showView("summary");
  el.summaryStatus.textContent = "Yükleniyor…";
  renderSummary();
  try {
    await loadSummary();
    el.summaryStatus.textContent = "";
    renderSummary();
  } catch (error) {
    el.summaryStatus.textContent = "Özet alınamadı: " + friendlyError(error);
  }
}

function moneyShareText() {
  const jobs = moneyJobs();
  const t = moneyTotals(jobs);
  const status = { open: "açık işler", closed: "biten işler", all: "açık + biten" }[state.moneyStatus];
  const title = { debt: "Kalan ödemeler", due: "Sözü gelen ödemeler", all: "Tüm işler ödeme durumu", paid: "Ödemesi biten işler" }[state.moneyMode] + ` (${status})`;
  const lines = jobs.map((j) => {
    const remaining = Number(j.remaining) || 0;
    const price = Number(j.price) || 0;
    return `• ${j.customer_name}: ${price > 0 ? (remaining > 0 ? "kalan " + money.format(remaining) : "ödendi") : "fiyat yok"}`;
  });
  return [`${title} · ${dayFmt.format(new Date())}`, "", ...lines, "", `Toplam fiyat: ${money.format(t.price)}`, `Ödenen: ${money.format(t.paid)}`, `Kalan: ${money.format(t.remaining)}`, `${jobs.length} iş`].join("\n");
}

async function shareMoney() {
  const text = moneyShareText();
  try {
    if (navigator.share) { await navigator.share({ title: "Kalan ödemeler", text }); return; }
    await navigator.clipboard.writeText(text);
    toast("Liste kopyalandı, WhatsApp'a yapıştırabilirsiniz");
  } catch (error) {
    if (error?.name === "AbortError") return;
    toast("Paylaşılamadı: " + friendlyError(error), true);
  }
}

// ---------------------------------------------------------------------------
// Detay
// ---------------------------------------------------------------------------
async function openDetail(jobId, pushHistory = true) {
  state.activeJobId = jobId;
  if (pushHistory) {
    state.returnView = currentView() === "money" ? "money" : "list";
    history.pushState({ view: "detail", id: jobId, from: state.returnView }, "");
  }
  showView("detail");
  state.events = []; state.checks = []; state.payments = []; state.files = [];
  renderDetail();
  renderExtras();
  try {
    await loadJobExtras(jobId);
    renderExtras();
  } catch (error) {
    toast("Detay alınamadı: " + friendlyError(error), true);
  }
}

function closeDetail() {
  state.activeJobId = null;
  if (state.returnView === "money") { showView("money"); renderMoney(); }
  else showView("list");
}

// Telefonun geri tuşu: alt pencere → kapat; detay → liste/kalan listesi; kalan listesi/özet → liste.
function goBack() {
  if (anySheetOpen()) { closeSheets(); return; }
  if (history.state?.view) history.back();
  else if (currentView() === "detail") closeDetail();
  else showView("list");
}

function applyHistoryState(s) {
  if (state.skipPop) { state.skipPop = false; state.popResolve?.(); state.popResolve = null; return; }
  if (anySheetOpen()) {
    el.overlay.hidden = true;
    [el.jobDialog, el.stagePicker, el.stagesDialog].forEach((x) => { x.hidden = true; });
    const sameView = (s?.view || "list") === currentView() && (s?.view !== "detail" || s.id === state.activeJobId);
    if (sameView) return; // sadece pencere kapandı, görünüm aynı
  }
  if (s?.sheet) { history.back(); return; } // ileri tuşuyla pencere durumuna gelindi: atla
  if (s?.view === "detail" && state.jobs.some((j) => j.id === s.id)) {
    state.returnView = s.from === "money" ? "money" : "list";
    openDetail(s.id, false);
  } else if (s?.view === "money") {
    state.activeJobId = null;
    openMoney(false);
  } else if (s?.view === "summary") {
    state.activeJobId = null;
    openSummary(false);
  } else {
    state.activeJobId = null;
    showView("list");
  }
}

function renderDetail() {
  const job = activeJob();
  if (!job) { closeDetail(); return; }

  el.detailTitle.textContent = job.customer_name;
  el.detailNo.textContent = `#${job.job_no}${job.phone ? " · " + job.phone : ""}`;

  const tel = phoneHref(job.phone);
  el.callLink.href = tel || "#";
  el.callLink.setAttribute("aria-disabled", tel ? "false" : "true");
  const wa = whatsappHref(job.phone);
  el.waLink.href = wa || "#";
  el.waLink.setAttribute("aria-disabled", wa ? "false" : "true");
  const maps = mapsHref(job);
  el.mapLink.href = maps || "#";
  el.mapLink.setAttribute("aria-disabled", maps ? "false" : "true");

  el.detailAddress.textContent = [job.district, job.address].filter(Boolean).join(" · ");
  el.detailNote.textContent = job.note || "";

  // Uyarı şeridi
  const alerts = [];
  if (Number(job.remaining) > 0 && job.status !== "cancelled") alerts.push(`<span class="alert money">💰 Kalan ${money.format(job.remaining)}</span>`);
  if (job.reminder_at && job.status === "open") alerts.push(`<span class="alert remind${isDueDate(job.reminder_at) ? " danger" : ""}">🔔 ${dayFmt.format(new Date(job.reminder_at + "T00:00"))}${job.reminder_note ? " · " + escapeHtml(job.reminder_note) : ""}</span>`);
  if (job.appointment_at && job.status === "open") alerts.push(`<span class="alert appt">📅 Aksa ${dateFmt.format(new Date(job.appointment_at))}</span>`);
  if (Number(job.missing_checks) > 0 && job.status === "open") alerts.push(`<span class="alert">☐ ${job.missing_checks} eksik</span>`);
  el.alertStrip.innerHTML = alerts.join("");

  el.stageCard.style.borderLeftColor = job.stage_color;
  el.stageName.textContent = job.stage_name;
  el.stageSince.textContent = `${daysLabel(job.stage_changed_at)} önce · ${dateFmt.format(new Date(job.stage_changed_at))}`;

  const isOpen = job.status === "open";
  el.statusBanner.hidden = isOpen;
  el.statusBanner.className = "status-banner " + job.status;
  el.statusBanner.textContent = job.status === "cancelled" ? "Bu iş iptal edildi." : "Bu iş tamamlandı.";

  const next = nextStage(job.stage_id);
  el.nextStageButton.hidden = !isOpen || !next;
  if (next) {
    el.nextStageButton.textContent = `→ ${next.name}`;
    el.nextStageButton.dataset.stageId = next.id;
  }
  el.pickStageButton.hidden = !isOpen;
  el.cancelJobButton.hidden = !isOpen;
  el.reopenJobButton.hidden = isOpen;

  // Ödeme
  el.priceInput.value = Number(job.price) > 0 ? String(Number(job.price)) : "";
  el.paidTotal.textContent = money.format(job.paid_total || 0);
  el.remainingTotal.textContent = money.format(job.remaining || 0);
  el.remainingTotal.style.color = Number(job.remaining) > 0 ? "var(--red)" : "var(--green)";
  el.paySummary.textContent = Number(job.price) > 0 ? (Number(job.remaining) > 0 ? `kalan ${money.format(job.remaining)}` : "tamam") : "fiyat girilmedi";
  el.paySummary.className = "section-meta" + (Number(job.remaining) > 0 ? " warn" : Number(job.price) > 0 ? " ok" : "");
  el.reminderInput.value = job.reminder_at || "";
  el.reminderNote.value = job.reminder_note || "";
  if (!el.payDate.value) el.payDate.value = todayStr();

  // Tarihler
  el.plannedInput.value = job.planned_at || "";
  el.appointmentInput.value = toLocalInputValue(job.appointment_at);
  el.appointmentResult.hidden = !(isOpen && job.appointment_at);
  const dateBits = [];
  if (job.planned_at) dateBits.push("montaj " + dayShortFmt.format(new Date(job.planned_at + "T00:00")));
  if (job.appointment_at) dateBits.push("Aksa " + shortDateFmt.format(new Date(job.appointment_at)));
  el.datesSummary.textContent = dateBits.join(" · ");

  // Kontrol özeti
  const total = activeCheckItems().length;
  const done = total - Number(job.missing_checks || 0);
  el.checksSummary.textContent = `${done}/${total}`;
  el.checksSummary.className = "section-meta" + (done === total && total > 0 ? " ok" : done < total && job.status === "open" ? " warn" : "");

  el.filesSummary.textContent = Number(job.file_count) > 0 ? `${job.file_count} dosya` : "";

  // Mesajlar
  el.messageButtons.innerHTML = MESSAGE_TEMPLATES.map((t) => {
    const href = whatsappHref(job.phone, fillTemplate(t.text, job));
    return `<a class="btn btn-outline msg-btn" ${href ? `href="${href}" target="_blank" rel="noopener"` : 'aria-disabled="true" href="#"'}>
      <span>${escapeHtml(t.title)}<small>${escapeHtml(t.hint)}</small></span></a>`;
  }).join("");
  if (!wa) el.messageButtons.innerHTML = `<p class="hint">Telefon numarası 10 haneli olmalı (örn. 0532 111 22 33).</p>` + el.messageButtons.innerHTML;
}

function renderExtras() {
  renderChecklist();
  renderPayments();
  renderFiles();
  renderTimeline();
}

function renderChecklist() {
  const doneMap = new Map(state.checks.map((c) => [c.item_id, c]));
  el.checklist.innerHTML = activeCheckItems().map((item) => {
    const c = doneMap.get(item.id);
    return `<button type="button" class="check-row${c ? " done" : ""}" data-item="${item.id}">
      <span class="box">${c ? "✓" : ""}</span>
      <span>${escapeHtml(item.name)}</span>
      ${c ? `<span class="who">${dayShortFmt.format(new Date(c.done_at))}</span>` : ""}
    </button>`;
  }).join("") || '<p class="hint">Kontrol maddesi tanımlı değil.</p>';
}

function renderPayments() {
  el.paymentList.innerHTML = state.payments.map((p) => `
    <li><strong>${money.format(p.amount)}</strong><span class="kind">${escapeHtml(p.method)}</span>${p.note ? `<span>${escapeHtml(p.note)}</span>` : ""}
      <span class="meta">${dayFmt.format(new Date(p.paid_at + "T00:00"))}</span>
      ${state.member?.role === "admin" ? `<button type="button" class="del" data-del-payment="${p.id}" title="Sil">✕</button>` : ""}
    </li>`).join("");
}

function renderFiles() {
  el.fileList.innerHTML = state.files.map((f) => `
    <li><span class="kind">${escapeHtml(KIND_LABELS[f.kind] || f.kind)}</span>
      <a href="#" data-open-file="${f.id}">${escapeHtml(f.name)}</a>
      <span class="meta">${dayShortFmt.format(new Date(f.created_at))}</span>
      <button type="button" class="del" data-del-file="${f.id}" title="Sil">✕</button>
    </li>`).join("");
}

function renderTimeline() {
  el.timeline.innerHTML = state.events.map((ev) => {
    let text = "";
    if (ev.kind === "created") text = `İş açıldı · ${ev.to_stage_name || ""}`;
    else if (ev.kind === "stage") text = `${ev.from_stage_name || "—"} → ${ev.to_stage_name || "—"}${ev.note ? " · " + ev.note : ""}`;
    else if (ev.kind === "appointment") text = `Randevu: ${ev.note}`;
    else text = ev.note;
    return `<li class="${ev.kind}">
      <span class="tl-text">${escapeHtml(text)}</span>
      <span class="tl-meta">${dateFmt.format(new Date(ev.created_at))}${ev.created_by_name ? " · " + escapeHtml(ev.created_by_name) : ""}</span>
    </li>`;
  }).join("") || '<li class="note"><span class="tl-meta">Henüz kayıt yok.</span></li>';
}

async function changeStage(stageId, note = "") {
  const job = activeJob();
  if (!job) return;
  el.nextStageButton.disabled = true;
  try {
    await rpc("set_job_stage", { p_job_id: job.id, p_stage_id: stageId, p_note: note });
    toast(`${stageById(stageId)?.name || "Aşama"} ✓`);
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  } finally {
    el.nextStageButton.disabled = false;
  }
}

function openStagePicker() {
  const job = activeJob();
  if (!job) return;
  el.stagePickerList.innerHTML = activeStages().map((s, i) => `
    <button type="button" class="stage-option${s.id === job.stage_id ? " current" : ""}" data-stage="${s.id}">
      <span class="idx">${i + 1}</span>
      <span class="dot" style="background:${escapeHtml(s.color)}"></span>
      <span>${escapeHtml(s.name)}</span>
    </button>`).join("");
  openSheet(el.stagePicker);
}

// ---------------------------------------------------------------------------
// Kontrol listesi
// ---------------------------------------------------------------------------
async function toggleCheck(itemId) {
  const jobId = state.activeJobId;
  const done = state.checks.some((c) => c.item_id === itemId);
  const item = state.checkItems.find((i) => i.id === itemId);
  try {
    if (done) {
      const { error } = await db.from("job_checks").delete().eq("job_id", jobId).eq("item_id", itemId);
      if (error) throw error;
    } else {
      const { error } = await db.from("job_checks").insert({ job_id: jobId, item_id: itemId, done_by: state.user.id });
      if (error) throw error;
    }
    await db.from("job_events").insert({ job_id: jobId, kind: "check", note: `${item?.name || "Madde"}: ${done ? "geri alındı" : "tamam ✓"}`, created_by: state.user.id });
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
}

async function autoTickForKind(kind) {
  const key = KIND_TO_CHECK[kind];
  const item = key ? state.checkItems.find((i) => i.key === key && i.is_active) : null;
  if (!item || state.checks.some((c) => c.item_id === item.id)) return;
  await db.from("job_checks").insert({ job_id: state.activeJobId, item_id: item.id, done_by: state.user.id });
}

// ---------------------------------------------------------------------------
// Ödeme ve plan
// ---------------------------------------------------------------------------
async function savePlan(patch) {
  const job = activeJob();
  if (!job) return;
  const params = {
    p_job_id: job.id,
    p_price: Number(job.price) || 0,
    p_planned_at: job.planned_at || null,
    p_reminder_at: job.reminder_at || null,
    p_reminder_note: job.reminder_note || "",
    ...patch,
  };
  try {
    await rpc("set_job_plan", params);
    toast("Kaydedildi");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
}

async function addPayment() {
  const amount = Number(el.payAmount.value);
  if (!(amount > 0)) { toast("Tutar girin", true); return; }
  el.addPaymentButton.disabled = true;
  try {
    const paidAt = el.payDate.value || todayStr();
    await rpc("add_payment", { p_job_id: state.activeJobId, p_amount: amount, p_method: el.payMethod.value, p_note: "", p_paid_at: paidAt });
    el.payAmount.value = "";
    el.payDate.value = todayStr();
    toast("Ödeme eklendi");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  } finally {
    el.addPaymentButton.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Dosyalar
// ---------------------------------------------------------------------------
// Fotoğrafı telefonda küçültür: uzun kenar 1600 px, JPEG. 5-10 MB'lık çekim ~400 KB olur.
async function compressImage(file) {
  if (!file.type.startsWith("image/") || file.size < 600 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function uploadFile(original) {
  if (!original) return;
  if (!original.type.startsWith("image/") && original.type !== "application/pdf") { toast("Sadece fotoğraf veya PDF yüklenebilir", true); return; }
  el.uploadStatus.textContent = "Hazırlanıyor…";
  const file = await compressImage(original);
  if (file.size > MAX_FILE_BYTES) { el.uploadStatus.textContent = ""; toast("Dosya 50 MB'tan büyük", true); return; }
  const jobId = state.activeJobId;
  const safeName = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "dosya";
  const path = `${jobId}/${Date.now()}_${safeName}`;
  el.uploadStatus.textContent = `Yükleniyor: ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`;
  document.querySelectorAll(".file-btn").forEach((b) => b.classList.add("busy"));
  try {
    const { error: upErr } = await db.storage.from(FILE_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) throw upErr;
    const { error: rowErr } = await db.from("job_files").insert({ job_id: jobId, kind: state.fileKind, path, name: file.name, size: file.size, mime: file.type || "", created_by: state.user.id });
    if (rowErr) throw rowErr;
    await autoTickForKind(state.fileKind);
    await db.from("job_events").insert({ job_id: jobId, kind: "file", note: `Dosya eklendi: ${KIND_LABELS[state.fileKind]} · ${file.name}`, created_by: state.user.id });
    el.uploadStatus.textContent = "";
    toast("Dosya yüklendi");
    await refreshDetail();
  } catch (error) {
    el.uploadStatus.textContent = "";
    toast(friendlyError(error), true);
  } finally {
    document.querySelectorAll(".file-btn").forEach((b) => b.classList.remove("busy"));
    el.cameraInput.value = "";
    el.fileInput.value = "";
  }
}

async function openFile(fileId) {
  const f = state.files.find((x) => x.id === Number(fileId));
  if (!f) return;
  const { data, error } = await db.storage.from(FILE_BUCKET).createSignedUrl(f.path, 3600);
  if (error || !data?.signedUrl) { toast(friendlyError(error || "Bağlantı alınamadı"), true); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

async function deleteFile(fileId) {
  const f = state.files.find((x) => x.id === Number(fileId));
  if (!f || !window.confirm(`"${f.name}" silinsin mi?`)) return;
  try {
    const { error: sErr } = await db.storage.from(FILE_BUCKET).remove([f.path]);
    if (sErr) throw sErr;
    const { error } = await db.from("job_files").delete().eq("id", f.id);
    if (error) throw error;
    await db.from("job_events").insert({ job_id: state.activeJobId, kind: "file", note: `Dosya silindi: ${f.name}`, created_by: state.user.id });
    toast("Dosya silindi");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
}

// ---------------------------------------------------------------------------
// Yeni / düzenle
// ---------------------------------------------------------------------------
function openJobDialog(job = null) {
  state.editingJobId = job?.id || null;
  el.jobDialogTitle.textContent = job ? "İşi düzenle" : "Yeni iş";
  el.fName.value = job?.customer_name || "";
  el.fPhone.value = job?.phone || "";
  el.fDistrict.value = job ? (job.district || "") : (localStorage.getItem(LAST_DISTRICT_KEY) || "Soma");
  el.fAddress.value = job?.address || "";
  el.fNote.value = job?.note || "";
  el.jobDialogError.textContent = "";
  el.fStageWrap.hidden = Boolean(job);
  if (!job) {
    el.fStage.innerHTML = activeStages().filter((s) => !s.is_terminal).map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }
  openSheet(el.jobDialog);
  setTimeout(() => el.fName.focus(), 50);
}

async function saveJobDialog(event) {
  event.preventDefault();
  el.jobDialogSave.disabled = true;
  el.jobDialogError.textContent = "";
  const payload = {
    p_customer_name: el.fName.value.trim(),
    p_phone: prettyPhone(el.fPhone.value),
    p_address: el.fAddress.value.trim(),
    p_district: el.fDistrict.value.trim(),
    p_note: el.fNote.value.trim(),
  };
  if (payload.p_district) localStorage.setItem(LAST_DISTRICT_KEY, payload.p_district);
  try {
    if (state.editingJobId) {
      await rpc("update_job_info", { p_job_id: state.editingJobId, ...payload });
      toast("Bilgiler güncellendi");
      closeSheets();
      await refreshDetail();
    } else {
      const id = await rpc("create_job", { ...payload, p_stage_id: Number(el.fStage.value) });
      toast("İş açıldı");
      await closeSheets();
      await loadJobs();
      if (id) openDetail(id);
    }
  } catch (error) {
    el.jobDialogError.textContent = friendlyError(error);
  } finally {
    el.jobDialogSave.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Aşama / kontrol yönetimi (admin)
// ---------------------------------------------------------------------------
function renderAdminLists() {
  const stages = [...state.stages].sort((a, b) => a.sort_order - b.sort_order);
  el.stagesList.innerHTML = stages.map((s, i) => `
    <div class="stage-row${s.is_active ? "" : " inactive"}" data-table="job_stages" data-row="${s.id}">
      <input type="text" value="${escapeHtml(s.name)}" data-field="name" maxlength="60">
      <button type="button" class="mini" data-act="up" ${i === 0 ? "disabled" : ""} title="Yukarı">↑</button>
      <button type="button" class="mini" data-act="down" ${i === stages.length - 1 ? "disabled" : ""} title="Aşağı">↓</button>
      <button type="button" class="mini" data-act="toggle" title="${s.is_active ? "Pasife al" : "Aktif et"}">${s.is_active ? "👁" : "🚫"}</button>
    </div>`).join("");
  const items = [...state.checkItems].sort((a, b) => a.sort_order - b.sort_order);
  el.checkItemsList.innerHTML = items.map((s, i) => `
    <div class="stage-row${s.is_active ? "" : " inactive"}" data-table="checklist_items" data-row="${s.id}">
      <input type="text" value="${escapeHtml(s.name)}" data-field="name" maxlength="60">
      <button type="button" class="mini" data-act="up" ${i === 0 ? "disabled" : ""} title="Yukarı">↑</button>
      <button type="button" class="mini" data-act="down" ${i === items.length - 1 ? "disabled" : ""} title="Aşağı">↓</button>
      <button type="button" class="mini" data-act="toggle" title="${s.is_active ? "Pasife al" : "Aktif et"}">${s.is_active ? "👁" : "🚫"}</button>
    </div>`).join("");
}

async function afterAdminChange() {
  await loadStages();
  renderAdminLists();
  renderChips();
  renderList();
}

async function handleAdminClick(event) {
  const btn = event.target.closest("[data-act]");
  if (!btn) return;
  const row = btn.closest("[data-row]");
  const table = row.dataset.table;
  const id = Number(row.dataset.row);
  const list = [...(table === "job_stages" ? state.stages : state.checkItems)].sort((a, b) => a.sort_order - b.sort_order);
  const idx = list.findIndex((s) => s.id === id);
  try {
    if (btn.dataset.act === "toggle") {
      const { error } = await db.from(table).update({ is_active: !list[idx].is_active }).eq("id", id);
      if (error) throw error;
    } else {
      const swapWith = list[btn.dataset.act === "up" ? idx - 1 : idx + 1];
      if (!swapWith) return;
      const a = list[idx];
      const first = await db.from(table).update({ sort_order: swapWith.sort_order }).eq("id", a.id);
      if (first.error) throw first.error;
      const second = await db.from(table).update({ sort_order: a.sort_order }).eq("id", swapWith.id);
      if (second.error) throw second.error;
    }
  } catch (error) {
    toast(friendlyError(error), true);
  }
  await afterAdminChange();
}

async function handleAdminRename(event) {
  const input = event.target.closest('[data-field="name"]');
  if (!input) return;
  const row = input.closest("[data-row]");
  const table = row.dataset.table;
  const id = Number(row.dataset.row);
  const name = input.value.trim();
  const current = (table === "job_stages" ? state.stages : state.checkItems).find((s) => s.id === id);
  if (!name || !current || name === current.name) return;
  const patch = { name };
  if (table === "job_stages") patch.short_name = name.length <= 14 ? name : current.short_name;
  const { error } = await db.from(table).update(patch).eq("id", id);
  if (error) { toast(friendlyError(error), true); return; }
  toast("Güncellendi");
  await afterAdminChange();
}

// ---------------------------------------------------------------------------
// Oturum
// ---------------------------------------------------------------------------
async function login(event) {
  event.preventDefault();
  el.loginError.textContent = "";
  el.loginButton.disabled = true;
  const username = el.loginUsername.value.trim();
  const email = username.includes("@") ? username : username.toLocaleLowerCase("tr-TR") + STAFF_EMAIL_SUFFIX;
  try {
    const { error } = await db.auth.signInWithPassword({ email, password: el.loginPassword.value });
    if (error) throw error;
  } catch (error) {
    el.loginError.textContent = friendlyError(error);
  } finally {
    el.loginButton.disabled = false;
  }
}

async function applySession(session) {
  state.user = session?.user || null;
  if (!state.user) {
    el.app.hidden = true;
    el.authGate.hidden = false;
    state.member = null;
    if (state.channel) { await db.removeChannel(state.channel); state.channel = null; }
    return;
  }
  const { data: member, error } = await db.from("staff_members").select("user_id,display_name,role").eq("user_id", state.user.id).maybeSingle();
  if (error || !member) {
    el.loginError.textContent = error ? "Veritabanı kurulumu tamamlanmamış: " + friendlyError(error) : "Bu hesap personel olarak yetkilendirilmemiş.";
    await db.auth.signOut();
    return;
  }
  state.member = member;
  el.staffName.textContent = member.display_name || state.user.email;
  el.stagesButton.hidden = member.role !== "admin";
  el.authGate.hidden = true;
  el.app.hidden = false;
  el.loginPassword.value = "";
  try {
    await loadStages();
    await loadJobs();
    subscribeRealtime();
  } catch (error) {
    toast(friendlyError(error), true);
  }
}

// ---------------------------------------------------------------------------
// Olaylar
// ---------------------------------------------------------------------------
el.loginForm.addEventListener("submit", login);
el.logoutButton.addEventListener("click", () => db.auth.signOut());

el.searchInput.addEventListener("input", () => { state.search = el.searchInput.value; renderList(); });
el.sortSelect.value = state.sort;
el.sortSelect.addEventListener("change", () => {
  state.sort = el.sortSelect.value;
  localStorage.setItem(SORT_KEY, state.sort);
  renderList();
});
el.stageChips.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-filter]");
  if (!chip) return;
  state.filter = chip.dataset.filter;
  localStorage.setItem(FILTER_KEY, state.filter);
  renderChips();
  renderList();
});
el.jobList.addEventListener("click", (event) => {
  if (event.target.closest("[data-call]")) return;
  const card = event.target.closest("[data-id]");
  if (card) openDetail(card.dataset.id);
});
el.newJobButton.addEventListener("click", () => openJobDialog());

el.moneyButton.addEventListener("click", () => openMoney());
el.moneyBack.addEventListener("click", goBack);
el.moneyShare.addEventListener("click", shareMoney);
el.moneySearch.addEventListener("input", () => { state.moneySearch = el.moneySearch.value; renderMoney(); });
el.moneyMode.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-mode]");
  if (!chip) return;
  state.moneyMode = chip.dataset.mode;
  localStorage.setItem(MONEY_MODE_KEY, state.moneyMode);
  renderMoney();
});
el.moneyStatus.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-status]");
  if (!chip) return;
  state.moneyStatus = chip.dataset.status;
  localStorage.setItem(MONEY_STATUS_KEY, state.moneyStatus);
  renderMoney();
});
el.moneyList.addEventListener("click", (event) => {
  if (event.target.closest("[data-call]")) return;
  const row = event.target.closest("[data-id]");
  if (row) openDetail(row.dataset.id);
});
[el.districtChips, el.moneyDistrict].forEach((box) => box.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-district]");
  if (!chip) return;
  state.district = chip.dataset.district;
  localStorage.setItem(DISTRICT_KEY, state.district);
  renderChips();
  renderList();
  if (!el.moneyView.hidden) renderMoney();
}));
el.summaryButton.addEventListener("click", () => openSummary());
el.summaryBack.addEventListener("click", goBack);

window.addEventListener("popstate", (event) => { if (state.user) applyHistoryState(event.state); });
history.replaceState(null, "");

el.backButton.addEventListener("click", goBack);
el.editJobButton.addEventListener("click", () => openJobDialog(activeJob()));
el.nextStageButton.addEventListener("click", () => changeStage(Number(el.nextStageButton.dataset.stageId)));
el.pickStageButton.addEventListener("click", openStagePicker);
el.stagePickerList.addEventListener("click", (event) => {
  const opt = event.target.closest("[data-stage]");
  if (!opt) return;
  closeSheets();
  changeStage(Number(opt.dataset.stage));
});
el.stagePickerCancel.addEventListener("click", () => closeSheets());

el.checklist.addEventListener("click", (event) => {
  const row = event.target.closest("[data-item]");
  if (row) toggleCheck(Number(row.dataset.item));
});

el.savePriceButton.addEventListener("click", () => savePlan({ p_price: Number(el.priceInput.value) || 0 }));
el.addPaymentButton.addEventListener("click", addPayment);
el.payAmount.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addPayment(); } });
el.paymentList.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-del-payment]");
  if (!btn || !window.confirm("Bu ödeme kaydı silinsin mi?")) return;
  const { error } = await db.from("payments").delete().eq("id", Number(btn.dataset.delPayment));
  if (error) { toast(friendlyError(error), true); return; }
  toast("Ödeme silindi");
  await refreshDetail();
});
el.saveReminderButton.addEventListener("click", () => savePlan({ p_reminder_at: el.reminderInput.value || null, p_reminder_note: el.reminderNote.value.trim() }));
el.savePlannedButton.addEventListener("click", () => savePlan({ p_planned_at: el.plannedInput.value || null }));

el.fileKinds.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-kind]");
  if (!chip) return;
  state.fileKind = chip.dataset.kind;
  el.fileKinds.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
});
el.cameraInput.addEventListener("change", () => uploadFile(el.cameraInput.files[0]));
el.fileInput.addEventListener("change", () => uploadFile(el.fileInput.files[0]));
el.fileList.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-file]");
  if (open) { event.preventDefault(); openFile(open.dataset.openFile); return; }
  const del = event.target.closest("[data-del-file]");
  if (del) deleteFile(del.dataset.delFile);
});

el.saveAppointmentButton.addEventListener("click", async () => {
  const value = el.appointmentInput.value;
  const iso = value ? new Date(value).toISOString() : null;
  try {
    await rpc("set_job_appointment", { p_job_id: state.activeJobId, p_appointment_at: iso });
    toast(iso ? "Randevu kaydedildi" : "Randevu kaldırıldı");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
});
el.apptOpenedButton.addEventListener("click", async () => {
  try {
    await rpc("set_appointment_result", { p_job_id: state.activeJobId, p_opened: true, p_note: "" });
    toast("Gaz açıldı ✓");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
});
el.apptFailedButton.addEventListener("click", async () => {
  const reason = window.prompt("Neden açılamadı? (eksik, hata vb.)", "");
  if (reason === null) return;
  try {
    await rpc("set_appointment_result", { p_job_id: state.activeJobId, p_opened: false, p_note: reason });
    toast("Kaydedildi, randevu tekrar girilecek");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
});

async function addNote() {
  const note = el.noteInput.value.trim();
  if (!note) return;
  el.addNoteButton.disabled = true;
  const { error } = await db.from("job_events").insert({ job_id: state.activeJobId, kind: "note", note, created_by: state.user.id });
  el.addNoteButton.disabled = false;
  if (error) { toast(friendlyError(error), true); return; }
  el.noteInput.value = "";
  toast("Not eklendi");
  await refreshDetail();
}
el.addNoteButton.addEventListener("click", addNote);
el.noteInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addNote(); } });

el.cancelJobButton.addEventListener("click", async () => {
  const reason = window.prompt("İptal sebebi (isteğe bağlı):", "");
  if (reason === null) return;
  try {
    await rpc("set_job_status", { p_job_id: state.activeJobId, p_status: "cancelled", p_note: reason });
    toast("İş iptal edildi");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
});
el.reopenJobButton.addEventListener("click", async () => {
  try {
    await rpc("set_job_status", { p_job_id: state.activeJobId, p_status: "open", p_note: "" });
    toast("İş yeniden açıldı");
    await refreshDetail();
  } catch (error) {
    toast(friendlyError(error), true);
  }
});

el.jobDialog.addEventListener("submit", saveJobDialog);
el.jobDialogCancel.addEventListener("click", () => closeSheets());
el.overlay.addEventListener("click", () => closeSheets());

el.stagesButton.addEventListener("click", () => { renderAdminLists(); openSheet(el.stagesDialog); });
el.stagesClose.addEventListener("click", () => closeSheets());
el.stagesList.addEventListener("click", handleAdminClick);
el.stagesList.addEventListener("change", handleAdminRename);
el.checkItemsList.addEventListener("click", handleAdminClick);
el.checkItemsList.addEventListener("change", handleAdminRename);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.user) scheduleReload();
});

db.auth.onAuthStateChange((_event, session) => setTimeout(() => applySession(session), 0));
db.auth.getSession().then(({ data }) => applySession(data.session));
