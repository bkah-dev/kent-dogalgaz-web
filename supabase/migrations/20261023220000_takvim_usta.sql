-- Takvim: işe usta/ekip atama. jobs.crew + set_job_plan(p_crew) + jobs_view yeniden (j.* görünüm
-- oluşturulurken sabitlendiği için yeni sütun ancak görünüm yeniden yaratılınca gelir).
-- SQL Editor'de bir kez çalıştırın. Çalıştırılmadan önce uygulama usta alanını göndermez; takvim yine çalışır.

alter table public.jobs
  add column if not exists crew text not null default '';

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

drop function if exists public.set_job_plan(uuid, numeric, date, date, text);

create or replace function public.set_job_plan(
  p_job_id uuid,
  p_price numeric,
  p_planned_at date,
  p_reminder_at date,
  p_reminder_note text,
  p_crew text default null
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
begin
  if not public.is_staff() then raise exception 'Personel yetkisi gerekli'; end if;
  select * into v_old from public.jobs where id = p_job_id for update;
  if v_old.id is null then raise exception 'İş bulunamadı'; end if;

  v_crew := coalesce(trim(p_crew), v_old.crew);

  update public.jobs
  set price = coalesce(p_price, price),
      planned_at = p_planned_at,
      reminder_at = p_reminder_at,
      reminder_note = trim(coalesce(p_reminder_note, '')),
      crew = v_crew,
      updated_at = now()
  where id = p_job_id;

  if p_price is not null and p_price <> v_old.price then
    v_msg := v_msg || 'Fiyat: ' || to_char(p_price, 'FM999G999G990D00') || ' ₺. ';
  end if;
  if p_planned_at is distinct from v_old.planned_at then
    v_msg := v_msg || 'Plan: ' || coalesce(to_char(p_planned_at, 'DD.MM.YYYY'), 'kaldırıldı') || '. ';
  end if;
  if v_crew <> v_old.crew then
    v_msg := v_msg || 'Usta: ' || coalesce(nullif(v_crew, ''), 'kaldırıldı') || '. ';
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

revoke all on function public.set_job_plan(uuid, numeric, date, date, text, text) from public;
grant execute on function public.set_job_plan(uuid, numeric, date, date, text, text) to authenticated;
