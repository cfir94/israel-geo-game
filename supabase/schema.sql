-- =============================================================
--  אבן דרך · סכמת השרת (Supabase / PostgreSQL)
--  הדביקו את כל הקובץ ב-SQL Editor של הפרויקט והריצו.
--  הקובץ בטוח להרצה חוזרת – אפשר להריץ אותו שוב אחרי כל עדכון.
-- =============================================================

-- ---------- טבלת הפרופילים ----------
-- שורה אחת לכל משתמש. save מחזיק את בלוק ההתקדמות המלא;
-- שאר העמודות משוכפלות החוצה כדי שהלוח, האתגר והפיד ייקראו
-- בלי לחשוף את תוכן השמירה או את האימייל של אף אחד.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text        not null default '',
  xp           integer     not null default 0,
  stars        integer     not null default 0,
  save         jsonb       not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- ---------- תוספות: כיתה, רצף ותפקיד ----------
alter table public.profiles add column if not exists class_code  text    not null default '';
alter table public.profiles add column if not exists streak      integer not null default 0;
alter table public.profiles add column if not exists best_streak integer not null default 0;
alter table public.profiles add column if not exists shields     integer not null default 0;
alter table public.profiles add column if not exists last_active date;
alter table public.profiles add column if not exists is_teacher  boolean not null default false;

create index if not exists profiles_class_idx on public.profiles (class_code);

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

-- =============================================================
--  יומן פעילות יומי
--  שורה אחת למשתמש ליום. ממנו נגזרים הלוח השבועי, אתגר הכיתה
--  ומבט המרצה. אין בו תוכן – רק כמה נקודות וכמה שאלות.
-- =============================================================
create table if not exists public.activity (
  user_id   uuid    not null references auth.users(id) on delete cascade,
  day       date    not null,
  xp        integer not null default 0,
  questions integer not null default 0,
  primary key (user_id, day)
);

create index if not exists activity_day_idx on public.activity (day);

alter table public.activity enable row level security;

drop policy if exists "activity_own" on public.activity;
create policy "activity_own" on public.activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================
--  אירועי הישג – מזינים את הפיד הכיתתי
--  אין טקסט חופשי: המשחק כותב תווית מתוך רשימה סגורה, ולכן
--  אין כאן תוכן שמשתמש הקליד ואין מה למתן.
-- =============================================================
create table if not exists public.events (
  id         bigserial   primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  class_code text        not null default '',
  kind       text        not null,
  label      text        not null,
  value      integer     not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists events_class_idx on public.events (class_code, created_at desc);

alter table public.events enable row level security;

drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own" on public.events
  for insert with check (auth.uid() = user_id);

drop policy if exists "events_select_own" on public.events;
create policy "events_select_own" on public.events
  for select using (auth.uid() = user_id);

-- =============================================================
--  פונקציות הקריאה הקבוצתית
--  כולן security definer: ניגשות לטבלאות בעצמן ומחזירות אך ורק
--  שדות ציבוריים – שם, ניקוד, רצף. תוכן השמירה והאימייל לעולם
--  לא יוצאים מהן, וכל אחת מסוננת לכיתה של הקורא בלבד.
-- =============================================================

create or replace function public.my_class()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select class_code from public.profiles where id = auth.uid()), '');
$$;

-- תחילת השבוע הנוכחי, יום ראשון
create or replace function public.week_start()
returns date
language sql stable set search_path = public as $$
  select (date_trunc('week', (current_date + 1))::date - 1);
$$;

-- ---------- לוח הקבוצה ----------
-- p_period: 'week' לשבוע הנוכחי, 'all' לכל הזמן.
create or replace function public.leaderboard(p_period text default 'all')
returns table (
  display_name text,
  score        integer,
  stars        integer,
  streak       integer,
  is_me        boolean
)
language sql stable security definer set search_path = public as $$
  select p.display_name,
         case when p_period = 'week'
              then coalesce((select sum(a.xp)::int from public.activity a
                             where a.user_id = p.id
                               and a.day >= public.week_start()), 0)
              else p.xp end as score,
         p.stars,
         p.streak,
         (p.id = auth.uid()) as is_me
  from public.profiles p
  where p.display_name <> ''
    and p.class_code = public.my_class()
  order by 2 desc, p.stars desc, p.display_name
  limit 200;
$$;

-- ---------- אתגר הכיתה השבועי ----------
create or replace function public.class_week()
returns table (
  members   integer,
  active    integer,
  questions integer,
  xp        integer
)
language sql stable security definer set search_path = public as $$
  with mem as (
    select id from public.profiles where class_code = public.my_class()
  ), act as (
    select a.* from public.activity a
    where a.user_id in (select id from mem) and a.day >= public.week_start()
  )
  select (select count(*) from mem)::int,
         (select count(distinct user_id) from act)::int,
         coalesce((select sum(questions) from act), 0)::int,
         coalesce((select sum(xp) from act), 0)::int;
$$;

-- ---------- פיד ההישגים ----------
create or replace function public.class_feed(p_limit integer default 30)
returns table (
  display_name text,
  kind         text,
  label        text,
  value        integer,
  created_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.display_name, e.kind, e.label, e.value, e.created_at
  from public.events e
  join public.profiles p on p.id = e.user_id
  where e.class_code = public.my_class()
    and p.display_name <> ''
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------- מבט המרצה ----------
-- פירוט לכל תלמיד בכיתה, ורק למי שמסומן כמרצה.
create or replace function public.class_roster()
returns table (
  display_name   text,
  xp             integer,
  stars          integer,
  streak         integer,
  last_active    date,
  week_questions integer,
  week_xp        integer,
  weak_spot      text
)
language sql stable security definer set search_path = public as $$
  select p.display_name, p.xp, p.stars, p.streak, p.last_active,
         coalesce((select sum(a.questions)::int from public.activity a
                   where a.user_id = p.id and a.day >= public.week_start()), 0),
         coalesce((select sum(a.xp)::int from public.activity a
                   where a.user_id = p.id and a.day >= public.week_start()), 0),
         coalesce(p.save->>'weak', '')
  from public.profiles p
  where p.class_code = public.my_class()
    and p.display_name <> ''
    and exists (select 1 from public.profiles t
                where t.id = auth.uid() and t.is_teacher)
  order by p.last_active desc nulls last, p.xp desc;
$$;

revoke all on function public.leaderboard(text)   from public, anon;
revoke all on function public.class_week()        from public, anon;
revoke all on function public.class_feed(integer) from public, anon;
revoke all on function public.class_roster()      from public, anon;
revoke all on function public.my_class()          from public, anon;
grant execute on function public.leaderboard(text)   to authenticated;
grant execute on function public.class_week()        to authenticated;
grant execute on function public.class_feed(integer) to authenticated;
grant execute on function public.class_roster()      to authenticated;
grant execute on function public.my_class()          to authenticated;

-- ---------- יצירת פרופיל אוטומטית בהרשמה ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, class_code)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'display_name', ''),
          coalesce(new.raw_user_meta_data->>'class_code', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
--  להפוך את עצמכם למרצה – הריצו פעם אחת עם האימייל שלכם:
--
--    update public.profiles set is_teacher = true
--    where id = (select id from auth.users where email = 'you@example.com');
-- =============================================================
