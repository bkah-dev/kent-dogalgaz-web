-- Bildirimler (Web Push): abonelikler, gönderim günlüğü, zamanlanmış tetik.
-- Uygulama: Supabase SQL Editor'de bu dosya çalıştırılır. pg_cron bölümü için önce
-- Vault'a sır eklenmeli (aşağıda "KURULUM" notu). IS-TAKIP.md "Bildirimler" bölümüne bakın.

-- ---------------------------------------------------------------------------
-- 1. Abonelikler: her personelin her cihazı bir satır
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "staff can read own subscriptions" on public.push_subscriptions;
create policy "staff can read own subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid() and public.is_staff());

drop policy if exists "staff can add own subscriptions" on public.push_subscriptions;
create policy "staff can add own subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.is_staff());

drop policy if exists "staff can update own subscriptions" on public.push_subscriptions;
create policy "staff can update own subscriptions"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid() and public.is_staff())
  with check (user_id = auth.uid() and public.is_staff());

drop policy if exists "staff can delete own subscriptions" on public.push_subscriptions;
create policy "staff can delete own subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid() and public.is_staff());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Gönderim günlüğü: aynı gün aynı iş için aynı kişiye ikinci kez gitmesin (idempotent)
-- ---------------------------------------------------------------------------
create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  sent_on date not null,
  slot text not null check (slot in ('morning', 'evening', 'test', 'manual')),
  kind text not null check (kind in ('plan', 'appt', 'pay', 'reminder', 'test')),
  job_id uuid references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  status text not null default 'sent' check (status in ('sent', 'failed', 'gone')),
  error text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists push_log_once_idx
  on public.push_log (sent_on, slot, kind, coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id)
  where slot in ('morning', 'evening');

create index if not exists push_log_job_idx on public.push_log (job_id);

alter table public.push_log enable row level security;

drop policy if exists "staff can read push log" on public.push_log;
create policy "staff can read push log"
  on public.push_log for select to authenticated
  using (public.is_staff());

grant select on public.push_log to authenticated;
-- insert/update yalnızca service_role (Edge Function) yapar; RLS'yi atlar.

-- ---------------------------------------------------------------------------
-- 3. Zamanlayıcı: pg_cron + pg_net ile Edge Function'ı günde iki kez çağırır.
--    Saatler UTC: 05:00 UTC = 08:00 TR (bugünün işleri), 16:00 UTC = 19:00 TR (yarının işleri).
--
--    KURULUM (bir kez, SQL Editor'de, bu dosyadan ÖNCE):
--      select vault.create_secret('<uzun rastgele metin>', 'push_cron_secret');
--    Aynı metin Edge Function'a CRON_SECRET olarak verilir (IS-TAKIP.md).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.push_cron_call(p_slot text)
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_cron_secret' limit 1;
  if v_secret is null then
    raise exception 'vault: push_cron_secret yok';
  end if;
  return net.http_post(
    url := 'https://bluvpmkvvioezdwfivbr.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('slot', p_slot),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function public.push_cron_call(text) from public;

do $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('push-morning', 'push-evening');
exception when others then null;
end $$;

select cron.schedule('push-morning', '0 5 * * *', $$select public.push_cron_call('morning')$$);
select cron.schedule('push-evening', '0 16 * * *', $$select public.push_cron_call('evening')$$);
