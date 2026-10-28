# Kent Doğalgaz İş Takip

Personel ekranı `admin/` adresindedir (`https://kentmekanikdogalgaz.com/admin/`). Statik HTML + JS; veri ve giriş Supabase'tedir. Zühtü Bey personel ekranıyla aynı kalıp.

## Neler var

- Giriş sonrası **Ana panel**: dört kutu (açık işler, bu hafta iş günü, yaklaşan ödeme + toplam alacak, bu hafta Aksa randevusu), "Bugün" listesi (iş günleri, Aksa randevuları, ödeme sözü gelen/geçenler; satırda 📞/💬) ve "Takip edilecekler" (keşif cevabı bekleyen, sözü geçmiş ödeme, 7+ gün bekleyen, gaz açım eksiği, fiyatsız, telefonsuz). Her kutu ve satır dokununca ilgili filtreli ekrana gider.
- **Sol menü**: bilgisayarda (900 px ve üstü) sabit, telefonda ☰ ile açılan çekmece. Ana panel, İşler, Keşifler (keşif+teklif), Sözleşmeler (sözleşme+planlandı+montaj), Projeler (gönderildi+onay), Gaz açım (eksikler+randevu+gaz), Takvim, Tahsilatlar, Raporlar, Ayarlar (admin), Çıkış. Sayılar canlı. Grup seçince listede geçici bir çip olarak görünür.
- Personel girişi (kullanıcı adı + parola)
- İş listesi: aşamaya göre filtre, isim/telefon/adres arama
- Kartta tek dokunuşla arama, detayda yol tarifi
- Tek büyük buton ile sonraki aşamaya geçiş; istenirse başka aşama seçimi
- Aksa randevu tarihi
- Not ekleme ve tam geçmiş (kim, ne zaman, hangi aşama)
- 7 günden uzun süredir aynı aşamada bekleyen işler kırmızı
- İptal / yeniden açma
- Admin: aşama adlarını değiştirme, sıralama, pasife alma
- Birden fazla telefonda anlık güncelleme (Realtime)
- Ana ekrana ekleyince uygulama gibi açılır (manifest)

## Aşamalar (v2, gerçek saha akışı)

1. Keşif yapıldı
2. Teklif verildi
3. Sözleşme yapıldı
4. İş planlandı
5. Montaj yapıldı
6. Proje Aksa'ya gönderildi (montaj videosundan çizilir)
7. Proje onaylandı
8. Eksikler tamamlanıyor (camcı, elektrikçi, sayaç)
9. Aksa randevusu alındı
10. Gaz açıldı
11. Tamamlandı (iş kapanır)

## v2 ile gelenler

- Kontrol listesi (sözleşme fotoğrafı, abone formu, proje PDF, montaj videosu WhatsApp'a gönderildi, kombi barkodu, servis randevusu, sayaç, camcı, elektrikçi). Admin ekler/çıkarır.
- Ödeme: toplam fiyat, ödemeler (nakit/havale/kart), kalan, ödeme sözü tarihi + hatırlatma notu. "Kalan ödeme" filtresi. Fiyat bir kez girilince kilitlenir (🔒 Değiştir): değiştirmek için yeni fiyat + sebep zorunlu, "Fiyat değişti: eski → yeni. Sebep: …" olarak geçmişe yazılır.
- Dosyalar: fotoğraf ve PDF, Supabase Storage `job-files` (özel bucket). Fotoğraf telefonda 1600 px JPEG'e küçültülür (~400 KB). Video yüklenmez, WhatsApp'ta kalır. Listedeki "Sil" düğmesi dosyayı siler (uygulama içi onay penceresi, geçmişe yazılır). Üç yükleme yolu: "Fotoğraf çek", "Dosya seç" ve "Yapıştır" (WhatsApp'ta fotoğrafa uzun bas → Kopyala → uygulamada Yapıştır; telefon ilk seferde pano izni sorar). Bilgisayarda detay ekranındayken Ctrl+V de çalışır.
- "Bugün" filtresi: Aksa randevusu bugün/geçmiş, hatırlatma günü gelmiş, montaj planı bugün.
- Aksa randevu sonucu: "Gaz açıldı" (aşamayı ilerletir) / "Açılamadı" (sebep yazılır, randevu silinir, tekrar girilir).
- Müşteriye hazır WhatsApp mesajları (keşif takibi, sayaç al, randevu bilgisi, kalan ödeme). wa.me bağlantısı, uygulama göndermez, WhatsApp'ta açar.
- Kalan ödemeler listesi (liste ekranında üstteki ₺ düğmesi): tüm işler tek listede, en çok kalanı olan üstte; üstte toplam fiyat / ödenen / kalan. İki filtre satırı: "Borcu olanlar / Sözü gelen / Ödemesi biten / Hepsi" ve "Açık işler / Biten işler / Açık + biten"; seçimler telefonda hatırlanır. Arama; toplamlar o an görünen işlere göre hesaplanır. Satırda 📞 arama ve 💬 "kalan ödeme" WhatsApp mesajı (tutar hazır yazılı). Sözü geçmiş hatırlatmalar kırmızı. ⇪ ile liste metin olarak paylaşılır (WhatsApp'a yapıştırmak için). Satıra dokununca işin detayı açılır, geri gelince liste kaldığı yerden devam eder.
- Ana listede sıralama (aramanın yanındaki kutu): Son işlem / En uzun bekleyen / Kalan ödeme / İsim / Yeni açılan. Seçim hatırlanır.
- Telefonun geri tuşu uygulama içinde çalışır: açık alt pencereyi kapatır, detaydan listeye, kalan listesi/özetten ana listeye döner; uygulamayı kapatmaz.
- İlçe filtresi: birden fazla ilçe olunca ana listede ve kalan listesinde ilçe çipleri çıkar (sayılarıyla). Seçim iki ekranda ortak ve hatırlanır.
- Aylık özet (📊): son 12 ay için yeni iş / gaz açılan / tamamlanan / tahsilat tablosu, bu ayın üç kutusu, açık işlerin aşama dağılımı (7+ gün bekleyenler kırmızı) ve "Şu an" sayıları (borçlu, sözü geçmiş, fiyatsız, telefonsuz). Excel'den aktarılan işler ve ödemeleri aylık sayımlara girmez.
- Maliyet / teklif (🧾, detayda Ödeme'nin üstünde): iş alırken kalem kalem fiyat. Kalemler admin'in Ayarlar (⚙) altında tuttuğu fiyat listesinden gelir (kategoriler: İş, Kombi, Malzeme, Hizmet; ad, birim, nakit fiyat; pasife alma/silme). "+ Kalem ekle" ile kategori seçip dokun; "Serbest kalem" ile elle tutar (indirim için eksi). Adet −/+ ile değişir. Altta Nakit toplamı ve Kart toplamı (Ayarlar'daki "Kart farkı %" ile); "Nakit/Kart fiyatı işe yaz" iş fiyatını tek dokunuşla yazar (onay sorar, geçmişe "Fiyat maliyet tablosundan yazıldı" düşer). Kalem fiyatı eklendiği anki fiyattır; liste sonradan değişse eski işler değişmez. Başlık toplamı gösterir, iş fiyatından farklıysa uyarır.
- Hazır WhatsApp mesajında tarih eksikse (Aksa randevusu / iş günü girilmemişse) düğme önce tarihi sorar, WhatsApp'ı seçilen tarihle açar ve tarihi işe de kaydeder.
- Ödeme eklerken tarih seçilir (varsayılan bugün; geçmiş veya ileri tarih serbest, vadeli çek/senet için ileri tarih girilebilir).
- Yeni iş: ilçe son kullanılanla dolu gelir; telefon kaydederken `0532 111 22 33` biçimine çevrilir. "Sözleşme fotoğrafı" bölümünde 📷 Fotoğraf çek / 🖼️ Galeriden seç (birden çok sayfa olabilir, × ile çıkarılır); Kaydet'e basınca iş açılır, fotoğraflar küçültülüp "Sözleşme" olarak yüklenir ve kontrol listesinde "Sözleşme fotoğrafı" işaretlenir. Fotoğraf eklenince başlangıç aşaması daha erken bir aşamadaysa "Sözleşme yapıldı"ya alınır (elle değiştirilebilir). Düzenleme ekranında bu bölüm yoktur, sonradan eklemek için Dosyalar kullanılır.
- Yol tarifi (📍 Tarif): Google Haritalar'ı yol tarifi modunda açar. Adreste ya da notta harita linki (maps.app.goo.gl, Google/Apple Maps) veya koordinat (`39.1873, 27.6094`) varsa doğrudan o kullanılır; adres bulunamayan yerlerde müşteriden konum linki isteyip adrese yapıştırın. Yoksa adresten daire/kat (`Daire 3`, `D:2`, `Kat 2`, `No 12/4`) çıkarılır, ilçeye il (Manisa ilçeleri için) ve Türkiye eklenir.
- Kartta not satırı (Excel'den gelenlerde iş içeriği: dönüşüm, kolon vb.).
- Takvim (📅): aylık ızgara, montaj planı olan işler günün içinde isimle (usta yazılmamışsa kırmızı), Aksa randevusu 🔥 ile. Güne dokununca altta o günün listesi: montajlar (usta rozeti) ve Aksa randevuları (saat); satırda 📞 ve 💬 (montaj için "şu gün geliyoruz, alanı boşaltın" mesajı, randevu için randevu mesajı), satıra dokununca iş detayı. "+ İş ekle": usta yaz, açık işlerden seç, o güne planlanır (usta son kullanılanla dolu gelir). ⇪ seçili günün haftasını metin olarak kopyalar (gün gün iş · adres · usta, Aksa randevuları), personel grubuna yapıştırmak için. Detayda "İş günü" bölümünde tarih + usta + not (örn. "3 kolon, 2. kat, etrafı toparlasınlar"; takvimde ve haftalık metinde görünür). Aksa gaz açma randevusu ayrı bölümde, yalnızca proje onayından sonraki aşamalarda ya da randevu girilmişse görünür; "Montaj günü bilgisi" WhatsApp şablonu plan tarihi + ustayı otomatik yazar.

## Excel'den toplu aktarım (Soma iş listesi)

`SOMA İŞ LİSTESİ.xlsx` için üretilmiş SQL dosyası repoda DEĞİLDİR (repo herkese açık; dosyada müşteri telefonları var). Dosya Berk'in masaüstünde durur ve Supabase `SQL Editor`'de bir kez çalıştırılır; ikinci çalıştırma kendini durdurur. Eşleme:

- `MÜŞTERİ` sayfası (SN 1-127) → `jobs`: ad soyad, telefon (`0532 111 22 33` biçimine çevrilir), ilçe (boşsa Soma), adres `Mah. + Sk./Cd. + No + daire`, not alanında `İçerik`, 2. telefon, kolon birimi ve `[Excel #SN]` etiketi.
- `ÖDEME` sayfası → `jobs.price` (TUTAR) ve taksit sütunları tek tek `payments` (yöntem "Diğer", tarih aktarım günü, not "Excel aktarımı · n. ödeme"). Kalan uygulamada hesaplanır.
- `PROJE` sayfası → VİDEO `+` ise kontrol listesinde "Montaj videosu" işaretli ve aşama **Montaj yapıldı**; ÇİZİM `+` ise aşama **Proje Aksa'ya gönderildi**; ABONELİK `+` ise "Abone formu alındı" işaretli. Diğerleri **Sözleşme yapıldı** ile açılır.
- `MÜŞTERİ (2)`, `BİLGİ`, `Sayfa10`, `Sayfa11` eski/ara kopyalar; aktarılmaz.

Depolama: ücretsiz planda 1 GB / dosya başına 50 MB / ay 5 GB indirme. Pro (25 $/ay) 100 GB.

Admin ekranından isim, sıra ve aktiflik değiştirilebilir.

## Supabase kurulumu

1. supabase.com'da yeni proje açın (Zühtü Bey'den ayrı). Bölge: Frankfurt.
2. `Authentication > Sign In / Providers > Email`: "Allow new users to sign up" KAPALI olsun.
3. `Authentication > Users > Add user` ile ilk hesabı açın. E-posta: `osman@personel.kentmekanikdogalgaz.com` gibi; "Auto Confirm User" işaretli. Bu adreslerin posta kutusu yoktur, parola sıfırlamayı admin panelden yapar.
4. `SQL Editor`'de `supabase/migrations/` altındaki dosyaları tarih sırasıyla çalıştırın (`..._is_takip.sql`, `..._is_takip_v2.sql`, `..._is_takip_v3.sql`). Migration'dan önce açılmış ilk hesap otomatik `admin` olur, sonrakiler `staff`.
5. `Project Settings > API` altındaki Project URL ve publishable (anon) key değerlerini `admin/supabase-config.js` dosyasına yazın.
6. Push edin; Vercel otomatik yayınlar.

Yeni personel: panelden `ad@personel.kentmekanikdogalgaz.com` hesabı açıp auto-confirm yeterli; trigger `staff_members` tablosuna ekler. Birini admin yapmak için SQL Editor'de:

```sql
update public.staff_members set role = 'admin'
where user_id = (select id from auth.users where email = 'ad@personel.kentmekanikdogalgaz.com');
```

Giriş ekranına sadece `osman` yazılır; uygulama uzantıyı kendisi ekler.

## Veri modeli

- `staff_members`: personel ve rol
- `job_stages`: aşama tanımları (ad, sıra, renk, aktif, kapanış aşaması mı)
- `jobs`: müşteri, adres, ilçe, not, mevcut aşama, randevu, iş günü (`planned_at`) + usta (`crew`) + iş notu (`plan_note`), durum (open/closed/cancelled)
- `job_events`: her aşama değişimi, not, randevu, iptal kaydı
- `price_items`: fiyat listesi (kategori, ad, birim, fiyat, sıra, aktif); `job_items`: işin maliyet kalemleri (ad/birim/fiyat o anki kopya, adet); `app_settings`: `card_markup_pct` (kart farkı yüzdesi)
- `jobs_view` / `job_events_view`: ekranın okuduğu birleşik görünümler

Aşama değişimi, randevu, iptal ve bilgi düzenleme RPC fonksiyonlarıyla yapılır; iş ve geçmiş kaydı tek işlemde yazılır. Tüm tablolar RLS ile korunur, yalnızca `staff_members`'taki hesaplar okuyup yazabilir.

## Bildirimler (Web Push)

Uygulama olmadan telefona bildirim: iPhone'da (iOS 16.4+) yalnızca **ana ekrana eklenmiş** uygulamada çalışır, Android/Chrome'da doğrudan çalışır. Her akşam 19:00'da yarının, her sabah 08:00'de bugünün iş günleri / Aksa randevuları / ödeme sözleri (`reminder_at`) / hatırlatmaları gönderilir. Bildirime dokununca ilgili iş açılır ve hazır WhatsApp mesajı vurgulanır (`/admin?job=<id>&tpl=<şablon>`). Admin her şeyi alır; `staff` rolü yalnızca `crew` alanında kendi adı geçen iş günlerini alır. Aynı gün aynı iş aynı kişiye ikinci kez gitmez (`push_log`).

Parçalar: `sw.js` (kökte; kapsam `/admin`), `admin/app.js` bildirim bölümü, `supabase/migrations/20261028120000_bildirim.sql` (`push_subscriptions`, `push_log`, pg_cron), `supabase/functions/push-reminders` (gönderici), `supabase/functions/_shared/webpush.js` (bağımlılıksız Web Push: VAPID + aes128gcm, Node ve Deno'da aynı dosya).

Kurulum (bir kez):

1. Anahtar üret: `node scripts/push-keys.mjs`. Çıkan **public** değeri `admin/supabase-config.js` içindeki `vapidPublicKey` alanına yaz. **Private** değer repoya girmez (repo herkese açık).
2. Supabase CLI ile giriş ve fonksiyon yayını (proje kökünde):
   ```
   npx supabase login
   npx supabase secrets set --project-ref bluvpmkvvioezdwfivbr VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:info@kentmekanikdogalgaz.com CRON_SECRET=<uzun rastgele metin>
   npx supabase functions deploy push-reminders --project-ref bluvpmkvvioezdwfivbr
   ```
   (`supabase/config.toml` içinde `verify_jwt = false`; yetki fonksiyonun içinde `x-cron-secret` ve kullanıcı JWT'si ile kontrol edilir.)
3. SQL Editor'de önce Vault sırrı: `select vault.create_secret('<aynı CRON_SECRET>', 'push_cron_secret');` sonra `20261028120000_bildirim.sql` dosyasını çalıştır (pg_cron + pg_net etkinleşir, iki zamanlı iş kurulur).
4. Push et; Vercel yayınlar. Telefonda: Safari › Paylaş › Ana Ekrana Ekle › uygulamayı ana ekrandan aç › menü › 🔔 Bildirimler › **Bildirimleri aç** › **Test bildirimi gönder**.

Elle tetikleme / kontrol (gönderim yapmadan ne gideceğini görmek için `dry`):
```
curl -X POST https://bluvpmkvvioezdwfivbr.supabase.co/functions/v1/push-reminders -H "x-cron-secret: <CRON_SECRET>" -H "content-type: application/json" -d '{"slot":"evening","dry":true}'
```
Zamanlayıcı durumu: `select * from cron.job;` ve `select * from cron.job_run_details order by start_time desc limit 10;`. Gönderim günlüğü: `select * from public.push_log order by created_at desc limit 50;`. Ölü abonelikler (404/410) otomatik silinir.

Tek bir cihaza elle test (Edge Function'sız): `VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node scripts/push-send.mjs sub.json "Başlık" "Metin"`.

## Ücretsiz plan notu

Supabase ücretsiz projeler 7 gün hiç kullanılmazsa duraklatılır; panelden "Restore" ile açılır, veri kaybolmaz.

## Sonraki geliştirmeler

- Proje PDF'i ve fotoğraf ekleme (Supabase Storage)
- Müşteriye telefon + iş no ile "işim nerede" sayfası
- Randevu günü hatırlatma
