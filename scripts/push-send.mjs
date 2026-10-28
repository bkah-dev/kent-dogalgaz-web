// Tek bir aboneliğe elle bildirim yollar (yerel test / arıza bakma). Edge Function'ı kullanmaz.
// Kullanım:
//   VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node scripts/push-send.mjs sub.json "Başlık" "Metin" [url]
// sub.json = tarayıcıdaki PushSubscription.toJSON() çıktısı ({ endpoint, keys: { p256dh, auth } })
import { readFileSync } from "node:fs";
import { sendWebPush } from "../supabase/functions/_shared/webpush.js";

const [file, title = "Kent İş", body = "Test bildirimi", url = "https://kentmekanikdogalgaz.com/admin"] = process.argv.slice(2);
if (!file) { console.error("sub.json yolu gerekli"); process.exit(1); }
const vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT || "mailto:info@kentmekanikdogalgaz.com" };
if (!vapid.publicKey || !vapid.privateKey) { console.error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ortam değişkenleri gerekli"); process.exit(1); }

const subscription = JSON.parse(readFileSync(file, "utf8"));
const r = await sendWebPush({ subscription, payload: { title, body, url, tag: "manual" }, vapid });
console.log(r);
process.exit(r.ok ? 0 : 2);
