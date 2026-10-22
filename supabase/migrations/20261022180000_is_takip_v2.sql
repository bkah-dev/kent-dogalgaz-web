-- v2: gerçek saha akışına göre aşamalar, kontrol listesi, ödeme, dosya, hatırlatma, randevu sonucu.

-- ---------------------------------------------------------------------------
-- Aşamalar: proje montajdan SONRA (video ile) çiziliyor. Sıra ve adlar yenilendi.
-- ---------------------------------------------------------------------------
update public.job_stages set key = key || '_old';

update public.job_stages set key = 'kesif',            name = 'Keşif yapıldı',               short_name = 'Keşif',        sort_order = 10,  color = '#5b6378', is_terminal = false, is_active = true where id = 1;
update public.job_stages set key = 'teklif',           name = 'Teklif verildi',              short_name = 'Teklif',       sort_order = 20,  color = '#7c6f9c', is_terminal = false, is_active = true where id = 2;
update public.job_stages set key = 'sozlesme',         name = 'Sözleşme yapıldı',            short_name = 'Sözleşme',     sort_order = 30,  color = '#16235C', is_terminal = false, is_active = true where id = 3;
update public.job_stages set key = 'planlandi',        name = 'İş planlandı',                short_name = 'Planlandı',    sort_order = 40,  color = '#2b5fb8', is_terminal = false, is_active = true where id = 4;
update public.job_stages set key = 'montaj',           name = 'Montaj yapıldı',              short_name = 'Montaj',       sort_order = 50,  color = '#FF8A3D', is_terminal = false, is_active = true where id = 5;
update public.job_stages set key = 'proje_gonderildi', name = 'Proje Aksa''ya gönderildi',   short_name = 'Proje gitti',  sort_order = 60,  color = '#b45309', is_terminal = false, is_active = true where id = 6;
update public.job_stages set key = 'proje_onay',       name = 'Proje onaylandı',             short_name = 'Proje onay',   sort_order = 70,  color = '#0e7490', is_terminal = false, is_active = true where id = 7;
update public.job_stages set key = 'eksikler',         name = 'Eksikler tamamlanıyor',       short_name = 'Eksikler',     sort_order = 80,  color = '#c2410c', is_terminal = false, is_active = true where id = 8;
update public.job_stages set key = 'randevu',          name = 'Aksa randevusu alındı',       short_name = 'Randevu',      sort_order = 90,  color = '#b45309', is_terminal = false, is_active = true where id = 9;
update public.job_stages set key = 'gaz',              name = 'Gaz açıldı',                  short_name = 'Gaz açık',     sort_order = 100, color = '#15803d', is_terminal = false, is_active = true where id = 10;
update public.job_stages set key = 'tamam',            name = 'Tamamlandı',                  short_name = 'Tamam',        sort_order = 110, color = '#166534', is_terminal = true,  is_active = true where id = 11;
update public.job_stages set key = 'kontrol_eski',     name = 'Kontrol geçti (eski)',        short_name = 'Eski',         sort_order = 900, is_active = false where id = 12;
update public.job_stages set key = 'tamam_eski',       name = 'Tamamlandı (eski)',           short_name = 'Eski',         sort_order = 910, is_active = false where id = 13;

-- Eski "Tamamlandı" (13) aşamasındaki işleri yeni terminal aşamaya taşı.
update public.jobs set stage_id = 11 where stage_id = 13;

-- ---------------------------------------------------------------------------
-- İş: fiyat, planlanan tarih, hatırlatma
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists price numeric(12,2) not null default 0 check (price >= 0),
  add column if not exists planned_at date,
  add column if not exists reminder_at date,
  add column if not exists reminder_note text not null default '';

-- ---------------------------------------------------------------------------
-- Kontrol listesi
-- ---------------------------------------------------------------------------
create table if not exists public.checklist_items (
  id smallint primary key,
  key text not null unique,
  name text not null,
  sort_order smallint not null,
  is_active boolean not null default true
);

alter table public.checklist_items enable row level security;

insert into public.checklist_items (id, key, name, sort_order) values
  (1, 'sozlesme_foto', 'Sözleşme fotoğrafı eklendi',     10),
  (2, 'abone_formu',   'Abone formu alındı',             20),
  (3, 'video',         'Montaj videosu WhatsApp''a gönderildi', 30),
  (4, 'barkod',        'Kombi barkodu paylaşıldı',       40),
  (5, 'servis',        'Kombi servis randevusu alındı',  50),
  (6, 'sayac',         'Müşteri sayacı aldı',            60),
  (7, 'camci',         'Camcı gönderildi',               70),
  (8, 'elektrikci',    'Elektrikçi gönderildi',          80),
  (9, 'proje',         'Proje PDF''i eklendi',           25)
on conflict (id) do nothing;

create policy "staff can read checklist items"
on public.checklist_items for select to authenticated using (public.is_staff());

create policy "admin can edit checklist items"
on public.checklist_items for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin can add checklist items"
on public.checklist_items for insert to authenticated with check (public.is_admin());

create table if not exists public.job_checks (
  job_id uuid not null references public.jobs(id) on delete cascade,
  item_id smallint not null references public.checklist_items(id),
  done_by uuid references auth.users(id),
  done_at timestamptz not null default now(),
  primary key (job_id, item_id)
);

alter table public.job_checks enable row level security;

create policy "staff can read checks"
on public.job_checks for select to authenticated using (public.is_staff());

create policy "staff can tick"
on public.job_checks for insert to authenticated
with check (public.is_staff() and done_by = auth.uid());

create policy "staff can untick"
on public.job_checks for delete to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Ödemeler
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'Nakit' check (method in ('Nakit', 'Havale', 'Kart', 'Diğer')),
  note text not null default '',
  paid_at date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists payments_job_idx on public.payments (job_id);

alter table public.payments enable row level security;

create policy "staff can read payments"
on public.payments for select to authenticated using (public.is_staff());

create policy "staff can add payments"
on public.payments for insert to authenticated
with check (public.is_staff() and created_by = auth.uid());

create policy "admin can delete payments"
on public.payments for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Dosyalar (Supabase Storage: job-files, özel)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('job-files', 'job-files', false, 52428800)
on conflict (id) do nothing;

create policy "staff can read job files"
on storage.objects for select to authenticated
using (bucket_id = 'job-files' and public.is_staff());

create policy "staff can upload job files"
on storage.objects for insert to authenticated
with check (bucket_id = 'job-files' and public.is_staff());

create policy "staff can delete job files"
on storage.objects for delete to authenticated
using (bucket_id = 'job-files' and public.is_staff());

create table if not exists public.job_files (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null default 'diger' check (kind in ('sozlesme', 'abone_formu', 'video', 'barkod', 'proje', 'diger')),
  path text not null unique,
  name text not null,
  size bigint not null default 0,
  mime text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists job_files_job_idx on public.job_files (job_id, created_at desc);

alter table public.job_files enable row level security;

create policy "staff can read file rows"
on public.job_files for select to authenticated using (public.is_staff());

create policy "staff can add file rows"
on public.job_files for insert to authenticated
with check (public.is_staff() and created_by = auth.uid());

create policy "staff can delete file rows"
on public.job_files for delete to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Olay türleri genişletildi
-- ---------------------------------------------------------------------------
alter table public.job_events drop constraint if exists job_events_kind_check;
alter table public.job_events add constraint job_events_kind_check
  check (kind in ('created', 'stage', 'note', 'appointment', 'status', 'edit', 'payment', 'reminder', 'file', 'check'));

drop policy if exists "staff can add notes" on public.job_events;
create policy "staff can add notes"
on public.job_events for insert to authenticated
with check (public.is_staff() and kind in ('note', 'file', 'check') and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Görünüm: ödenen, kalan, eksik kontrol sayısı, dosya sayısı
-- ---------------------------------------------------------------------------
drop view if exists public.jobs_view;
create view public.jobs_view
with (security_invoker = true)
as
select
  j.*,
  s.key as stage_key,
  s.name as stage_name,
  s.short_name as stage_short_name,
  s.color as stage_color,
  s.sort_order as stage_sort_order,
  s.is_terminal as stage_is_terminal,
  coalesce(m.display_name, '') as created_by_name,
  coalesce(p.paid_total, 0) as paid_total,
  greatest(j.price - coalesce(p.paid_total, 0), 0) as remaining,
  (select count(*) from public.checklist_items ci where ci.is_active)
    - coalesce(c.done_count, 0) as missing_checks,
  coalesce(f.file_count, 0) as file_count
from public.jobs j
join public.job_stages s on s.id = j.stage_id
left join public.staff_members m on m.user_id = j.created_by
left join (select job_id, sum(amount) as paid_total from public.payments group by job_id) p on p.job_id = j.id
left join (
  select jc.job_id, count(*) as done_count
  from public.job_checks jc join public.checklist_items ci on ci.id = jc.item_id and ci.is_active
  group by jc.job_id
) c on c.job_id = j.id
left join (select job_id, count(*) as file_count from public.job_files group by job_id) f on f.job_id = j.id;

grant select on public.jobs_view to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: ödeme ekle
-- ---------------------------------------------------------------------------
create or replace function public.add_payment(
  p_job_id uuid,
  p_amount numeric,
  p_method text default 'Nakit',
  p_note text default '',
  p_paid_at date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Tutar sıfırdan büyük olmalı'; end if;

  insert into public.payments (job_id, amount, method, note, paid_at, created_by)
  values (p_job_id, p_amount, coalesce(p_method, 'Nakit'), trim(coalesce(p_note, '')), coalesce(p_paid_at, current_date), auth.uid());

  insert into public.job_events (job_id, kind, note, created_by)
  values (p_job_id, 'payment',
          'Ödeme alındı: ' || to_char(p_amount, 'FM999G999G990D00') || ' ₺ (' || coalesce(p_method, 'Nakit') || ')'
          || case when coalesce(trim(p_note), '') = '' then '' else ' · ' || trim(p_note) end,
          auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: fiyat / planlanan tarih / hatırlatma
-- ---------------------------------------------------------------------------
create or replace function public.set_job_plan(
  p_job_id uuid,
  p_price numeric,
  p_planned_at date,
  p_reminder_at date,
  p_reminder_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.jobs%rowtype;
  v_msg text := '';
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  select * into v_old from public.jobs where id = p_job_id for update;
  if v_old.id is null then raise exception 'İş bulunamadı'; end if;

  update public.jobs
  set price = coalesce(p_price, price),
      planned_at = p_planned_at,
      reminder_at = p_reminder_at,
      reminder_note = trim(coalesce(p_reminder_note, '')),
      updated_at = now()
  where id = p_job_id;

  if p_price is not null and p_price <> v_old.price then
    v_msg := v_msg || 'Fiyat: ' || to_char(p_price, 'FM999G999G990D00') || ' ₺. ';
  end if;
  if p_planned_at is distinct from v_old.planned_at then
    v_msg := v_msg || 'Plan: ' || coalesce(to_char(p_planned_at, 'DD.MM.YYYY'), 'kaldırıldı') || '. ';
  end if;
  if p_reminder_at is distinct from v_old.reminder_at or trim(coalesce(p_reminder_note, '')) <> v_old.reminder_note then
    v_msg := v_msg || 'Hatırlatma: ' || coalesce(to_char(p_reminder_at, 'DD.MM.YYYY'), 'kaldırıldı')
             || case when coalesce(trim(p_reminder_note), '') = '' then '' else ' · ' || trim(p_reminder_note) end || '. ';
  end if;

  if v_msg <> '' then
    insert into public.job_events (job_id, kind, note, created_by)
    values (p_job_id, 'reminder', trim(v_msg), auth.uid());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Aksa randevu sonucu (açıldı / açılamadı)
-- ---------------------------------------------------------------------------
create or replace function public.set_appointment_result(
  p_job_id uuid,
  p_opened boolean,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from smallint;
  v_gaz smallint;
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  select stage_id into v_from from public.jobs where id = p_job_id for update;
  if v_from is null then raise exception 'İş bulunamadı'; end if;

  if p_opened then
    select id into v_gaz from public.job_stages where key = 'gaz' and is_active limit 1;
    if v_gaz is null then raise exception 'Gaz açıldı aşaması tanımlı değil'; end if;
    update public.jobs set stage_id = v_gaz, stage_changed_at = now(), updated_at = now() where id = p_job_id;
    insert into public.job_events (job_id, kind, from_stage_id, to_stage_id, note, created_by)
    values (p_job_id, 'stage', v_from, v_gaz, 'Randevuda gaz açıldı' || case when coalesce(trim(p_note), '') = '' then '' else ' · ' || trim(p_note) end, auth.uid());
  else
    update public.jobs set appointment_at = null, updated_at = now() where id = p_job_id;
    insert into public.job_events (job_id, kind, note, created_by)
    values (p_job_id, 'appointment', 'Gaz AÇILAMADI, randevu tekrar girilecek' || case when coalesce(trim(p_note), '') = '' then '' else ' · ' || trim(p_note) end, auth.uid());
  end if;
end;
$$;

revoke all on function public.add_payment(uuid, numeric, text, text, date) from public;
revoke all on function public.set_job_plan(uuid, numeric, date, date, text) from public;
revoke all on function public.set_appointment_result(uuid, boolean, text) from public;
grant execute on function public.add_payment(uuid, numeric, text, text, date) to authenticated;
grant execute on function public.set_job_plan(uuid, numeric, date, date, text) to authenticated;
grant execute on function public.set_appointment_result(uuid, boolean, text) to authenticated;

-- Ödeme / kontrol / dosya değişimleri de listeyi tazelesin.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments') then
    alter publication supabase_realtime add table public.payments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_checks') then
    alter publication supabase_realtime add table public.job_checks;
  end if;
end $$;
