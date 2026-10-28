// Web Push (RFC 8030 + RFC 8291 aes128gcm + RFC 8292 VAPID) — bağımlılıksız.
// Sadece WebCrypto ve fetch kullanır; Deno (Edge Function) ve Node 20+ altında aynı dosya çalışır.
// Kullanım: await sendWebPush({ subscription, payload: { title, body, url }, vapid: { publicKey, privateKey, subject }, ttl: 3600 })

const te = new TextEncoder();

export function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob((str + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(new Uint8Array(p), o); o += p.byteLength; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// VAPID anahtar çifti üretir: { publicKey (65 bayt raw, base64url), privateKey (32 bayt d, base64url) }
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = concat(new Uint8Array([4]), fromB64url(jwk.x), fromB64url(jwk.y));
  return { publicKey: b64url(pub), privateKey: jwk.d };
}

async function importVapidPrivate(publicKey, privateKey) {
  const pub = fromB64url(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID public key 65 baytlık sıkıştırılmamış P-256 olmalı");
  const jwk = { kty: "EC", crv: "P-256", x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: privateKey, ext: true };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function vapidAuthHeader(endpoint, vapid, expiresInSec = 12 * 3600) {
  const aud = new URL(endpoint).origin;
  const header = b64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + expiresInSec, sub: vapid.subject })));
  const unsigned = `${header}.${body}`;
  const key = await importVapidPrivate(vapid.publicKey, vapid.privateKey);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned)); // raw r||s, JWT'nin istediği biçim
  return `vapid t=${unsigned}.${b64url(sig)}, k=${vapid.publicKey}`;
}

// RFC 8291: payload'ı abonenin p256dh/auth anahtarlarıyla aes128gcm olarak şifreler.
export async function encryptPayload(plaintext, p256dh, auth) {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  if (uaPublic.length !== 65) throw new Error("p256dh 65 bayt olmalı");
  if (authSecret.length !== 16) throw new Error("auth 16 bayt olmalı");

  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicJwk = await crypto.subtle.exportKey("jwk", asKeys.publicKey);
  const asPublic = concat(new Uint8Array([4]), fromB64url(asPublicJwk.x), fromB64url(asPublicJwk.y));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));

  const keyInfo = concat(te.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  const record = concat(te.encode(plaintext), new Uint8Array([2])); // 0x02 = son kayıt ayracı
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Tek aboneye gönderir. Dönüş: { ok, status, gone, text } — gone=true ise abonelik ölü (404/410), silinmeli.
export async function sendWebPush({ subscription, payload, vapid, ttl = 3600, urgency = "normal" }) {
  const { endpoint, keys } = subscription;
  const body = await encryptPayload(typeof payload === "string" ? payload : JSON.stringify(payload), keys.p256dh, keys.auth);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": await vapidAuthHeader(endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "TTL": String(ttl),
      "Urgency": urgency,
    },
    body,
  });
  const text = res.ok ? "" : await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, text };
}
