-- =============================================================
--  מפת הארץ · סכמת השרת (Supabase / PostgreSQL)
--  הדביקו את כל הקובץ ב-SQL Editor של הפרויקט והריצו פעם אחת.
-- =============================================================

-- ---------- טבלת הפרופילים ----------
-- שורה אחת לכל משתמש. save מחזיק את בלוק ההתקדמות המלא;
-- xp / stars / display_name משוכפלים החוצה כדי שלוח הקבוצה
-- יוכל להיקרא בלי לחשוף את תוכן השמירה של אף אחד.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text        not null default '',
  xp           integer     not null default 0,
  stars        integer     not null default 0,
  save         jsonb       not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------- הרשאות: כל אחד רואה ועורך רק את עצמו ----------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- לוח הקבוצה ----------
-- פונקציה עם security definer: היא ניגשת לטבלה בעצמה ומחזירה
-- אך ורק שם, ניקוד וכוכבים. תוכן השמירה לעולם לא יוצא ממנה.
create or replace function public.leaderboard()
returns table (display_name text, xp integer, stars integer, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.display_name, p.xp, p.stars, p.updated_at
  from public.profiles p
  where p.display_name <> ''
  order by p.xp desc, p.stars desc
  limit 200;
$$;

revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;

-- ---------- יצירת פרופיל אוטומטית בהרשמה ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
