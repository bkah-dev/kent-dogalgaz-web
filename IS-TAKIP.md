# Kent Doğalgaz İş Takip

Personel ekranı `admin/` adresindedir (`https://kentmekanikdogalgaz.com/admin/`). Statik HTML + JS; veri ve giriş Supabase'tedir. Zühtü Bey personel ekranıyla aynı kalıp.

## Neler var

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
- Ödeme: toplam fiyat, ödemeler (nakit/havale/kart), kalan, ödeme sözü tarihi + hatırlatma notu. "Kalan ödeme" filtresi.
- Dosyalar: fotoğraf ve PDF, Supabase Storage `job-files` (özel bucket). Fotoğraf telefonda 1600 px JPEG'e küçültülür (~400 KB). Video yüklenmez, WhatsApp'ta kalır.
- "Bugün" filtresi: Aksa randevusu bugün/geçmiş, hatırlatma günü gelmiş, montaj planı bugün.
- Aksa randevu sonucu: "Gaz açıldı" (aşamayı ilerletir) / "Açılamadı" (sebep yazılır, randevu silinir, tekrar girilir).
- Müşteriye hazır WhatsApp mesajları (keşif takibi, sayaç al, randevu bilgisi, kalan ödeme). wa.me bağlantısı, uygulama göndermez, WhatsApp'ta açar.
- Kalan ödemeler listesi (liste ekranında üstteki ₺ düğmesi): tüm işler tek listede, en çok kalanı olan üstte; üstte toplam fiyat / ödenen / kalan. İki filtre satırı: "Borcu olanlar / Sözü gelen / Ödemesi biten / Hepsi" ve "Açık işler / Biten işler / Açık + biten"; seçimler telefonda hatırlanır. Arama; toplamlar o an görünen işlere göre hesaplanır. Satırda 📞 arama ve 💬 "kalan ödeme" WhatsApp mesajı (tutar hazır yazılı). Sözü geçmiş hatırlatmalar kırmızı. ⇪ ile liste metin olarak paylaşılır (WhatsApp'a yapıştırmak için). Satıra dokununca işin detayı açılır, geri gelince liste kaldığı yerden devam eder.
- Ana listede sıralama (aramanın yanındaki kutu): Son işlem / En uzun bekleyen / Kalan ödeme / İsim / Yeni açılan. Seçim hatırlanır.
- Telefonun geri tuşu uygulama içinde çalışır: açık alt pencereyi kapatır, detaydan listeye, kalan listesi/özetten ana listeye döner; uygulamayı kapatmaz.
- İlçe filtresi: birden fazla ilçe olunca ana listede ve kalan listesinde ilçe çipleri çıkar (sayılarıyla). Seçim iki ekranda ortak ve hatırlanır.
- Aylık özet (📊): son 12 ay için yeni iş / gaz açılan / tamamlanan / tahsilat tablosu, bu ayın üç kutusu, açık işlerin aşama dağılımı (7+ gün bekleyenler kırmızı) ve "Şu an" sayıları (borçlu, sözü geçmiş, fiyatsız, telefonsuz). Excel'den aktarılan işler ve ödemeleri aylık sayımlara girmez.
- Ödeme eklerken tarih seçilir (varsayılan bugün, ileri tarih kabul edilmez).
- Yeni iş: ilçe son kullanılanla dolu gelir; telefon kaydederken `0532 111 22 33` biçimine çevrilir.
- Kartta not satırı (Excel'den gelenlerde iş içeriği: dönüşüm, kolon vb.).

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
4. `SQL Editor`'de `supabase/migrations/` altındaki dosyaları tarih sırasıyla çalıştırın (önce `..._is_takip.sql`, sonra `..._is_takip_v2.sql`). Migration'dan önce açılmış ilk hesap otomatik `admin` olur, sonrakiler `staff`.
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
- `jobs`: müşteri, adres, ilçe, not, mevcut aşama, randevu, durum (open/closed/cancelled)
- `job_events`: her aşama değişimi, not, randevu, iptal kaydı
- `jobs_view` / `job_events_view`: ekranın okuduğu birleşik görünümler

Aşama değişimi, randevu, iptal ve bilgi düzenleme RPC fonksiyonlarıyla yapılır; iş ve geçmiş kaydı tek işlemde yazılır. Tüm tablolar RLS ile korunur, yalnızca `staff_members`'taki hesaplar okuyup yazabilir.

## Ücretsiz plan notu

Supabase ücretsiz projeler 7 gün hiç kullanılmazsa duraklatılır; panelden "Restore" ile açılır, veri kaybolmaz.

## Sonraki geliştirmeler

- Proje PDF'i ve fotoğraf ekleme (Supabase Storage)
- Müşteriye telefon + iş no ile "işim nerede" sayfası
- Randevu günü hatırlatma
- Aylık özet (kaç keşif, kaç gaz açma)
