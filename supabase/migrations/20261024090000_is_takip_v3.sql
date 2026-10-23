-- İş Takip v3 (toplu): takvim/usta, iş günü notu, maliyet tablosu (fiyat listesi + iş kalemleri), ayarlar.
-- SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir (if not exists / drop+create).
-- Not: "usta" (jobs.crew) kısmı 2026-10-23'te ayrı dosyayla uygulanmıştı; burada aynen tekrarlanır, zarar vermez.

-- ---------------------------------------------------------------------------
-- 1. jobs: usta + iş günü notu
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists crew text not null default '',
  add column if not exists plan_note text not null default '';

-- ---------------------------------------------------------------------------
-- 2. Fiyat listesi (admin düzenler) ve iş kalemleri (maliyet tablosu)
-- ---------------------------------------------------------------------------
create table if not exists public.price_items (
  id bigint generated always as identity primary key,
  category text not null default 'is' check (category in ('is', 'kombi', 'malzeme', 'hizmet')),
  name text not null,
  unit text not null default 'adet',
  price numeric(12,2) not null default 0 check (price >= 0),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.price_items enable row level security;

drop policy if exists "staff can read price items" on public.price_items;
create policy "staff can read price items"
on public.price_items for select to authenticated using (public.is_staff());

drop policy if exists "admin can insert price items" on public.price_items;
create policy "admin can insert price items"
on public.price_items for insert to authenticated with check (public.is_admin());

drop policy if exists "admin can update price items" on public.price_items;
create policy "admin can update price items"
on public.price_items for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin can delete price items" on public.price_items;
create policy "admin can delete price items"
on public.price_items for delete to authenticated using (public.is_admin());

-- Başlangıç kalemleri (fiyatlar 0; Ayarlar'dan doldurulur). Tablo boşsa eklenir.
insert into public.price_items (category, name, unit, price, sort_order)
select * from (values
  ('is',      'Dönüşüm (mevcut tesisat)',      'adet',  0, 10),
  ('is',      'Yeni daire tesisatı',           'adet',  0, 20),
  ('is',      'İşyeri tesisatı',               'adet',  0, 30),
  ('is',      'Kolon hattı',                   'metre', 0, 40),
  ('kombi',   'Kombi 24 kW',                   'adet',  0, 100),
  ('kombi',   'Kombi 28 kW',                   'adet',  0, 110),
  ('malzeme', 'Sayaç',                         'adet',  0, 200),
  ('malzeme', 'Baca seti',                     'adet',  0, 210),
  ('malzeme', 'Petek',                         'adet',  0, 220),
  ('hizmet',  'Proje çizimi',                  'adet',  0, 300),
  ('hizmet',  'Aksa abonelik işlemleri',       'adet',  0, 310),
  ('hizmet',  'Camcı',                         'adet',  0, 320),
  ('hizmet',  'Elektrikçi',                    'adet',  0, 330)
) as v(category, name, unit, price, sort_order)
where not exists (select 1 from public.price_items);

create table if not exists public.job_items (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  item_id bigint references public.price_items(id) on delete set null,
  name text not null,
  unit text not null default 'adet',
  qty numeric(10,2) not null default 1 check (qty > 0),
  unit_price numeric(12,2) not null default 0,  -- indirim satırı için eksi olabilir
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists job_items_job_idx on public.job_items(job_id);

alter table public.job_items enable row level security;

drop policy if exists "staff can read job items" on public.job_items;
create policy "staff can read job items"
on public.job_items for select to authenticated using (public.is_staff());

drop policy if exists "staff can add job items" on public.job_items;
create policy "staff can add job items"
on public.job_items for insert to authenticated with check (public.is_staff() and created_by = auth.uid());

drop policy if exists "staff can update job items" on public.job_items;
create policy "staff can update job items"
on public.job_items for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff can delete job items" on public.job_items;
create policy "staff can delete job items"
on public.job_items for delete to authenticated using (public.is_staff());

-- Uygulama ayarları (kart farkı yüzdesi vb.)
create table if not exists public.app_settings (
  key text primary key,
  value text not null default ''
);

alter table public.app_settings enable row level security;

drop policy if exists "staff can read settings" on public.app_settings;
create policy "staff can read settings"
on public.app_settings for select to authenticated using (public.is_staff());

drop policy if exists "admin can write settings" on public.app_settings;
create policy "admin can write settings"
on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, value) values ('card_markup_pct', '0')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. jobs_view: yeni sütunlar (crew, plan_note, quote_total)
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
  coalesce(f.file_count, 0) as file_count,
  coalesce(q.quote_total, 0) as quote_total,
  coalesce(q.item_count, 0) as item_count
from public.jobs j
join public.job_stages s on s.id = j.stage_id
left join public.staff_members m on m.user_id = j.created_by
left join (select job_id, sum(amount) as paid_total from public.payments group by job_id) p on p.job_id = j.id
left join (
  select jc.job_id, count(*) as done_count
  from public.job_checks jc join public.checklist_items ci on ci.id = jc.item_id and ci.is_active
  group by jc.job_id
) c on c.job_id = j.id
left join (select job_id, count(*) as file_count from public.job_files group by job_id) f on f.job_id = j.id
left join (select job_id, sum(qty * unit_price) as quote_total, count(*) as item_count from public.job_items group by job_id) q on q.job_id = j.id;

grant select on public.jobs_view to authenticated;

-- ---------------------------------------------------------------------------
-- 4. set_job_plan: usta + iş günü notu
-- ---------------------------------------------------------------------------
drop function if exists public.set_job_plan(uuid, numeric, date, date, text);
drop function if exists public.set_job_plan(uuid, numeric, date, date, text, text);
drop function if exists public.set_job_plan(uuid, numeric, date, date, text, text, text);

create function public.set_job_plan(
  p_job_id uuid,
  p_price numeric,
  p_planned_at date,
  p_reminder_at date,
  p_reminder_note text,
  p_crew text default null,
  p_plan_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.jobs%rowtype;
  v_msg text := '';
  v_crew text;
  v_plan_note text;
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  select * into v_old from public.jobs where id = p_job_id for update;
  if v_old.id is null then raise exception 'İş bulunamadı'; end if;

  v_crew := coalesce(trim(p_crew), v_old.crew);
  v_plan_note := coalesce(trim(p_plan_note), v_old.plan_note);

  update public.jobs
  set price = coalesce(p_price, price),
      planned_at = p_planned_at,
      reminder_at = p_reminder_at,
      reminder_note = trim(coalesce(p_reminder_note, '')),
      crew = v_crew,
      plan_note = v_plan_note,
      updated_at = now()
  where id = p_job_id;

  if p_price is not null and p_price <> v_old.price then
    v_msg := v_msg || 'Fiyat: ' || to_char(p_price, 'FM999G999G990D00') || ' ₺. ';
  end if;
  if p_planned_at is distinct from v_old.planned_at then
    v_msg := v_msg || 'İş günü: ' || coalesce(to_char(p_planned_at, 'DD.MM.YYYY'), 'kaldırıldı') || '. ';
  end if;
  if v_crew <> v_old.crew then
    v_msg := v_msg || 'Usta: ' || coalesce(nullif(v_crew, ''), 'kaldırıldı') || '. ';
  end if;
  if v_plan_note <> v_old.plan_note then
    v_msg := v_msg || 'İş notu: ' || coalesce(nullif(v_plan_note, ''), 'kaldırıldı') || '. ';
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

revoke all on function public.set_job_plan(uuid, numeric, date, date, text, text, text) from public;
grant execute on function public.set_job_plan(uuid, numeric, date, date, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime: iş kalemleri ve fiyat listesi
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_items') then
    alter publication supabase_realtime add table public.job_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'price_items') then
    alter publication supabase_realtime add table public.price_items;
  end if;
end $$;
