// VAPID anahtar çifti üretir. Çalıştır: node scripts/push-keys.mjs
// Public key → admin/supabase-config.js (vapidPublicKey) ve Edge Function secret VAPID_PUBLIC_KEY
// Private key → yalnızca Edge Function secret VAPID_PRIVATE_KEY (repoya ASLA koyma; repo herkese açık)
import { generateVapidKeys } from "../supabase/functions/_shared/webpush.js";

const keys = await generateVapidKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
