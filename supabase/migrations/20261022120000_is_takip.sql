-- Kent Doğalgaz iş takip sistemi: personel, aşamalar, işler, olay geçmişi.
-- Zühtü Bey personel ekranındaki kalıp temel alınmıştır (staff_members + is_staff + RLS + RPC).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Personel
-- ---------------------------------------------------------------------------
create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and role = 'admin');
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

create policy "staff can read members"
on public.staff_members for select to authenticated
using (public.is_staff());

-- Onaylanmış @personel.kentmekanikdogalgaz.com hesapları otomatik personel olur.
create or replace function public.add_confirmed_personel_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if new.email is null
     or lower(new.email) not like '%@personel.kentmekanikdogalgaz.com'
     or new.email_confirmed_at is null then
    return new;
  end if;

  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.staff_members (user_id, display_name, role)
  values (new.id, v_display_name, 'staff')
  on conflict (user_id) do update
    set display_name = case
      when public.staff_members.display_name = '' then excluded.display_name
      else public.staff_members.display_name
    end;

  return new;
end;
$$;

revoke all on function public.add_confirmed_personel_account() from public;

drop trigger if exists on_confirmed_personel_account on auth.users;
create trigger on_confirmed_personel_account
after insert or update of email, email_confirmed_at on auth.users
for each row
execute function public.add_confirmed_personel_account();

-- Migration'dan önce açılmış hesapları da ekler. İlk hesap admin olur.
insert into public.staff_members (user_id, display_name, role)
select
  id,
  coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), split_part(email, '@', 1)),
  case when row_number() over (order by created_at) = 1 then 'admin' else 'staff' end
from auth.users
where email_confirmed_at is not null
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Aşamalar
-- ---------------------------------------------------------------------------
create table if not exists public.job_stages (
  id smallint primary key,
  key text not null unique,
  name text not null,
  short_name text not null default '',
  sort_order smallint not null,
  color text not null default '#16235C',
  is_terminal boolean not null default false,
  is_active boolean not null default true
);

alter table public.job_stages enable row level security;

insert into public.job_stages (id, key, name, short_name, sort_order, color, is_terminal) values
  (1,  'kesif',            'Keşif yapıldı',                 'Keşif',          10,  '#5b6378', false),
  (2,  'teklif',           'Teklif verildi',                'Teklif',         20,  '#7c6f9c', false),
  (3,  'siparis',          'Sipariş alındı',                'Sipariş',        30,  '#16235C', false),
  (4,  'baglanti',         'Bağlantı anlaşması yapıldı',    'Bağlantı',       40,  '#2b5fb8', false),
  (5,  'proje_cizildi',    'Proje çizildi',                 'Proje çizildi',  50,  '#0e7490', false),
  (6,  'proje_gonderildi', 'Proje Aksa''ya gönderildi',     'Aksa''da',       60,  '#b45309', false),
  (7,  'proje_onay',       'Proje onaylandı',               'Proje onay',     70,  '#15803d', false),
  (8,  'montaj',           'Montaj yapıldı',                'Montaj',         80,  '#FF8A3D', false),
  (9,  'teslim',           'Tesisat teslim edildi',         'Teslim',         90,  '#c2410c', false),
  (10, 'randevu',          'Aksa randevusu alındı',         'Randevu',        100, '#b45309', false),
  (11, 'kontrol',          'Kontrol geçti / sayaç takıldı', 'Sayaç',          110, '#15803d', false),
  (12, 'gaz',              'Gaz açıldı',                    'Gaz açık',       120, '#E1251B', false),
  (13, 'tamam',            'Tamamlandı',                    'Tamam',          130, '#166534', true)
on conflict (id) do nothing;

create policy "staff can read stages"
on public.job_stages for select to authenticated using (public.is_staff());

create policy "admin can edit stages"
on public.job_stages for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin can add stages"
on public.job_stages for insert to authenticated with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- İşler
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_no integer generated always as identity unique,
  customer_name text not null,
  phone text not null default '',
  address text not null default '',
  district text not null default '',
  note text not null default '',
  stage_id smallint not null references public.job_stages(id),
  stage_changed_at timestamptz not null default now(),
  appointment_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_stage_idx on public.jobs (status, stage_id);
create index if not exists jobs_updated_idx on public.jobs (updated_at desc);

alter table public.jobs enable row level security;

create policy "staff can read jobs"
on public.jobs for select to authenticated using (public.is_staff());

create policy "staff can update job info"
on public.jobs for update to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "admin can delete jobs"
on public.jobs for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Olay geçmişi (aşama değişimi, not, randevu, kapanış)
-- ---------------------------------------------------------------------------
create table if not exists public.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('created', 'stage', 'note', 'appointment', 'status', 'edit')),
  from_stage_id smallint references public.job_stages(id),
  to_stage_id smallint references public.job_stages(id),
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists job_events_job_idx on public.job_events (job_id, created_at desc);

alter table public.job_events enable row level security;

create policy "staff can read events"
on public.job_events for select to authenticated using (public.is_staff());

create policy "staff can add notes"
on public.job_events for insert to authenticated
with check (public.is_staff() and kind = 'note' and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Görünüm: iş + aşama + oluşturan adı
-- ---------------------------------------------------------------------------
create or replace view public.jobs_view
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
  coalesce(m.display_name, '') as created_by_name
from public.jobs j
join public.job_stages s on s.id = j.stage_id
left join public.staff_members m on m.user_id = j.created_by;

create or replace view public.job_events_view
with (security_invoker = true)
as
select
  e.*,
  fs.name as from_stage_name,
  ts.name as to_stage_name,
  coalesce(m.display_name, '') as created_by_name
from public.job_events e
left join public.job_stages fs on fs.id = e.from_stage_id
left join public.job_stages ts on ts.id = e.to_stage_id
left join public.staff_members m on m.user_id = e.created_by;

-- ---------------------------------------------------------------------------
-- RPC: iş oluştur
-- ---------------------------------------------------------------------------
create or replace function public.create_job(
  p_customer_name text,
  p_phone text default '',
  p_address text default '',
  p_district text default '',
  p_note text default '',
  p_stage_id smallint default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  if coalesce(trim(p_customer_name), '') = '' then raise exception 'Müşteri adı gerekli'; end if;
  if not exists (select 1 from public.job_stages where id = p_stage_id and is_active) then
    raise exception 'Geçersiz aşama';
  end if;

  insert into public.jobs (customer_name, phone, address, district, note, stage_id, created_by)
  values (trim(p_customer_name), trim(coalesce(p_phone, '')), trim(coalesce(p_address, '')),
          trim(coalesce(p_district, '')), trim(coalesce(p_note, '')), p_stage_id, auth.uid())
  returning id into v_id;

  insert into public.job_events (job_id, kind, to_stage_id, note, created_by)
  values (v_id, 'created', p_stage_id, '', auth.uid());

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: aşama değiştir (atomik: iş + olay)
-- ---------------------------------------------------------------------------
create or replace function public.set_job_stage(
  p_job_id uuid,
  p_stage_id smallint,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from smallint;
  v_terminal boolean;
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;

  select stage_id into v_from from public.jobs where id = p_job_id for update;
  if v_from is null then raise exception 'İş bulunamadı'; end if;

  select is_terminal into v_terminal from public.job_stages where id = p_stage_id and is_active;
  if v_terminal is null then raise exception 'Geçersiz aşama'; end if;

  update public.jobs
  set stage_id = p_stage_id,
      stage_changed_at = now(),
      updated_at = now(),
      status = case when v_terminal then 'closed' else 'open' end
  where id = p_job_id;

  insert into public.job_events (job_id, kind, from_stage_id, to_stage_id, note, created_by)
  values (p_job_id, 'stage', v_from, p_stage_id, trim(coalesce(p_note, '')), auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: randevu tarihi
-- ---------------------------------------------------------------------------
create or replace function public.set_job_appointment(
  p_job_id uuid,
  p_appointment_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;

  update public.jobs
  set appointment_at = p_appointment_at, updated_at = now()
  where id = p_job_id;
  if not found then raise exception 'İş bulunamadı'; end if;

  insert into public.job_events (job_id, kind, note, created_by)
  values (p_job_id, 'appointment',
          case when p_appointment_at is null then 'Randevu kaldırıldı'
               else to_char(p_appointment_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') end,
          auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: durum (iptal / yeniden aç)
-- ---------------------------------------------------------------------------
create or replace function public.set_job_status(
  p_job_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  if p_status not in ('open', 'closed', 'cancelled') then raise exception 'Geçersiz durum'; end if;

  update public.jobs set status = p_status, updated_at = now() where id = p_job_id;
  if not found then raise exception 'İş bulunamadı'; end if;

  insert into public.job_events (job_id, kind, note, created_by)
  values (p_job_id, 'status',
          case p_status when 'cancelled' then 'İptal edildi' when 'closed' then 'Kapatıldı' else 'Yeniden açıldı' end
          || case when coalesce(trim(p_note), '') = '' then '' else ': ' || trim(p_note) end,
          auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: müşteri bilgisi düzenle
-- ---------------------------------------------------------------------------
create or replace function public.update_job_info(
  p_job_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_district text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  if coalesce(trim(p_customer_name), '') = '' then raise exception 'Müşteri adı gerekli'; end if;

  update public.jobs
  set customer_name = trim(p_customer_name),
      phone = trim(coalesce(p_phone, '')),
      address = trim(coalesce(p_address, '')),
      district = trim(coalesce(p_district, '')),
      note = trim(coalesce(p_note, '')),
      updated_at = now()
  where id = p_job_id;
  if not found then raise exception 'İş bulunamadı'; end if;

  insert into public.job_events (job_id, kind, note, created_by)
  values (p_job_id, 'edit', 'Bilgiler güncellendi', auth.uid());
end;
$$;

-- Not eklendiğinde işin updated_at değeri de ilerlesin (liste sıralaması için).
create or replace function public.touch_job_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs set updated_at = now() where id = new.job_id;
  return new;
end;
$$;

drop trigger if exists on_job_event_touch on public.job_events;
create trigger on_job_event_touch
after insert on public.job_events
for each row execute function public.touch_job_on_event();

revoke all on function public.create_job(text, text, text, text, text, smallint) from public;
revoke all on function public.set_job_stage(uuid, smallint, text) from public;
revoke all on function public.set_job_appointment(uuid, timestamptz) from public;
revoke all on function public.set_job_status(uuid, text, text) from public;
revoke all on function public.update_job_info(uuid, text, text, text, text, text) from public;
grant execute on function public.create_job(text, text, text, text, text, smallint) to authenticated;
grant execute on function public.set_job_stage(uuid, smallint, text) to authenticated;
grant execute on function public.set_job_appointment(uuid, timestamptz) to authenticated;
grant execute on function public.set_job_status(uuid, text, text) to authenticated;
grant execute on function public.update_job_info(uuid, text, text, text, text, text) to authenticated;

grant select on public.jobs_view, public.job_events_view to authenticated;

-- Realtime: iş listesi anlık güncellensin.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end $$;
