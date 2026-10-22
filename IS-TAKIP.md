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

## Aşamalar (varsayılan)

1. Keşif yapıldı
2. Teklif verildi
3. Sipariş alındı
4. Bağlantı anlaşması yapıldı
5. Proje çizildi
6. Proje Aksa'ya gönderildi
7. Proje onaylandı
8. Montaj yapıldı
9. Tesisat teslim edildi
10. Aksa randevusu alındı
11. Kontrol geçti / sayaç takıldı
12. Gaz açıldı
13. Tamamlandı (iş kapanır)

Admin ekranından isim, sıra ve aktiflik değiştirilebilir.

## Supabase kurulumu

1. supabase.com'da yeni proje açın (Zühtü Bey'den ayrı). Bölge: Frankfurt.
2. `Authentication > Sign In / Providers > Email`: "Allow new users to sign up" KAPALI olsun.
3. `Authentication > Users > Add user` ile ilk hesabı açın. E-posta: `osman@personel.kentmekanikdogalgaz.com` gibi; "Auto Confirm User" işaretli. Bu adreslerin posta kutusu yoktur, parola sıfırlamayı admin panelden yapar.
4. `SQL Editor`'de `supabase/migrations/20261022120000_is_takip.sql` dosyasını çalıştırın. Migration'dan önce açılmış ilk hesap otomatik `admin` olur, sonrakiler `staff`.
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
