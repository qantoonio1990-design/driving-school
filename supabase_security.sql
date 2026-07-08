-- ============================================================
-- Автошкола — безопасный слой доступа к данным
-- Выполнять в Supabase → SQL Editor одним запуском (Run).
-- Предполагается, что RLS уже включён и старые политики удалены.
-- ============================================================

-- 1. RLS на всякий случай (идемпотентно) ---------------------
alter table public.students      enable row level security;
alter table public.bookings      enable row level security;
alter table public.blocked_slots enable row level security;

-- 2. Политики для ИНСТРУКТОРА (залогинен через Supabase Auth) -
--    Аноним (обычный посетитель) под эти политики не попадает.
drop policy if exists inst_students on public.students;
drop policy if exists inst_bookings on public.bookings;
drop policy if exists inst_blocked  on public.blocked_slots;

create policy inst_students on public.students
  for all to authenticated using (true) with check (true);
create policy inst_bookings on public.bookings
  for all to authenticated using (true) with check (true);
create policy inst_blocked on public.blocked_slots
  for all to authenticated using (true) with check (true);

-- 3. Серверные функции для УЧЕНИКА (обходят RLS, но отдают -----
--    только то, что положено; вызываются анонимом по коду).

-- 3.1 Вход по коду — возвращает только одну свою строку
create or replace function public.student_login(p_code text)
returns table (id uuid, name text, phone text, total_lessons int, completed_lessons int)
language sql security definer set search_path = public as $$
  select id, name, phone, total_lessons, completed_lessons
  from public.students
  where upper(code) = upper(trim(p_code))
  limit 1;
$$;

-- 3.2 Занятость сетки — какие слоты заняты/закрыты, БЕЗ имён и телефонов
create or replace function public.occupancy()
returns table (date text, time_slot text, kind text)
language sql security definer set search_path = public as $$
  select b.date::text, b.time_slot::text, 'booked'::text  from public.bookings b
  union all
  select s.date::text, s.time_slot::text, 'blocked'::text from public.blocked_slots s;
$$;

-- 3.3 Свои записи по коду
create or replace function public.my_bookings(p_code text)
returns table (date text, time_slot text)
language sql security definer set search_path = public as $$
  select b.date::text, b.time_slot::text
  from public.bookings b
  join public.students s on s.id = b.student_id
  where upper(s.code) = upper(trim(p_code));
$$;

-- 3.4 Записаться на слот (проверки на сервере)
create or replace function public.student_book(p_code text, p_date text, p_time text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_student uuid;
begin
  select id into v_student from public.students where upper(code) = upper(trim(p_code)) limit 1;
  if v_student is null then return 'bad_code'; end if;
  if exists (select 1 from public.blocked_slots where date::text = p_date and time_slot::text = p_time) then
    return 'blocked';
  end if;
  if exists (select 1 from public.bookings where date::text = p_date and time_slot::text = p_time) then
    return 'taken';
  end if;
  insert into public.bookings (date, time_slot, student_id) values (p_date, p_time, v_student);
  return 'ok';
end;
$$;

-- 3.5 Отменить свою запись (только свою — сверяем код)
create or replace function public.student_cancel(p_code text, p_date text, p_time text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_student uuid;
begin
  select id into v_student from public.students where upper(code) = upper(trim(p_code)) limit 1;
  if v_student is null then return 'bad_code'; end if;
  delete from public.bookings
    where date::text = p_date and time_slot::text = p_time and student_id = v_student;
  return 'ok';
end;
$$;

-- 4. Права на вызов функций анониму и залогиненному -----------
--    (сами функции обходят RLS через SECURITY DEFINER)
grant execute on function public.student_login(text)               to anon, authenticated;
grant execute on function public.occupancy()                       to anon, authenticated;
grant execute on function public.my_bookings(text)                 to anon, authenticated;
grant execute on function public.student_book(text, text, text)    to anon, authenticated;
grant execute on function public.student_cancel(text, text, text)  to anon, authenticated;

-- Прямой доступ анонима к таблицам НЕ открываем — только функции выше.
