# iHelp — עיצוב טכני מפורט

מסמך זה הוא תוכנית המימוש. ה-SQL כאן *הוא* הסכימה —
שלב 4 מתמלל אותה למיגרציות. כל מדיניות RLS נושאת עמה את חוק מפרט-המוצר
שהיא אוכפת.

> **שינויי מוצר מאוחרים (הסמכות היא במיגרציות):** ה-
> `payment_type` של מגיש הבקשה הוסר (מיגרציה `0011`) — בקשה אינה נושאת
> בחירה של בתשלום/התנדבות; **התמחור כולו של העוזר**, על ההצעה,
> באמצעות `offers.pricing_mode` ∈ {fixed, volunteer, after_job} + `price` /
> `final_price` (מיגרציות `0009`–`0011`). במקומות שבהם מסמך זה עדיין מציג
> `help_requests.payment_type` או חוק הצעה של "חיוב רק על בקשות בתשלום",
> המיגרציות גוברות עליו: כל בקשה מקבלת את כל שלוש עמדות ההצעה.
> ראו `supabase/migrations/0009`–`0011`. מיגרציה `0012` מוסיפה
> `profiles.avatar_path` (אווטאר אופציונלי; באקט **ציבורי** שלישי בשם `avatars`);
> מיגרציה `0013` מקבעת `final_price is null` במדיניות ה-INSERT של ההצעה —
> `final_price` נכתב רק על ידי ה-RPC `set_final_price`.

---

## 1. סכימת בסיס הנתונים

### 1.1 Enums

```sql
create type public.request_status  as enum
  ('open','has_offers','assigned','completed','rated','cancelled');
create type public.offer_status    as enum
  ('active','selected','closed','withdrawn');
create type public.application_kind   as enum ('identity','professional');
create type public.application_status as enum
  ('pending','approved','rejected','revoked');
create type public.payment_type    as enum ('paid','volunteer');  -- ⚠️ הוחלף (SUPERSEDED): הוסר במיגרציה 0011 (ראו הערת ה-header); התמחור עבר ל-offers.pricing_mode
```

Enums במקום `text + CHECK`: ערכי מכונת-המצבים הם קבוצות סגורות שכל
העיצוב נשען עליהן; enum הופך מצב לא-חוקי ל*שגיאת טיפוס*, והגדרת ה-
enum מתעדת את עצמה בכל כלי בדיקת DB. (פשרה מקובלת:
הוספת ערך מצריכה מיגרציה — זה בסדר, הקבוצות יציבות מעצם התכנון.)

חריגה מכוונת אחת: `help_requests.category` נשאר `text + CHECK`. זהו
*תוכן*, לא מכונת-מצבים — רשימה שצפויה לגדול עם המוצר — ו-
`text + CHECK` שומר על כך שהוספות יהיו מיגרציה קטנה בעלת צורת-נתונים. הרשימה
הקנונית בצד האפליקציה היא `lib/categories.ts` (מפתחות + תוויות בעברית); ה-CHECK
של ה-DB משקף את המפתחות שלה.

### 1.2 טבלאות

```sql
-- Public profile: everything here is readable by any signed-in user.
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text not null default ''
                       check (char_length(display_name) <= 40),
  is_identity_verified boolean not null default false,   -- set only by review_application / revoke_verification
  is_professional      boolean not null default false,   -- set only by review_application / revoke_verification
  created_at           timestamptz not null default now()
);

-- Private profile: own-row access only. Separate table because Postgres RLS is
-- row-level; these columns must never ride along with the broadly-readable row.
create table public.profiles_private (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  phone      text check (phone is null or phone ~ '^0\d{8,9}$'),
  lat        double precision check (lat between -90 and 90),
  lng        double precision check (lng between -180 and 180),
  constraint location_all_or_none check ((lat is null) = (lng is null)),
  is_admin   boolean not null default false              -- set only manually in SQL
);

create table public.verification_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  kind             public.application_kind not null,
  status           public.application_status not null default 'pending',
  full_name        text not null check (char_length(full_name) between 2 and 60),
  self_description text not null default '' check (char_length(self_description) <= 500),
  -- the phone is part of the reviewed identity application (spec §8.2) — the
  -- admin must be able to see it via applications_select; on approval it is
  -- copied to profiles_private by review_application
  phone            text check (phone is null or phone ~ '^0\d{8,9}$'),
  constraint identity_requires_phone check (kind <> 'identity' or phone is not null),
  doc_path         text,            -- ID photo / certificate in verification-docs
  constraint professional_requires_doc check (kind <> 'professional' or doc_path is not null),
  admin_note       text,
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- Spec §9.2: at most one pending-or-approved application per user per kind.
-- Rejected/revoked rows stay behind as the audit trail and do not block re-apply.
create unique index one_open_application_per_kind
  on public.verification_applications (user_id, kind)
  where status in ('pending','approved');

create table public.help_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 80),
  description   text not null check (char_length(description) between 10 and 2000),
  category      text not null check (category in
                  ('repairs','electricity','plumbing','moving','tutoring',
                   'tech_help','errands','gardening','pets','other')),
  -- ⚠️ הוחלף (SUPERSEDED) (מיגרציה 0011): payment_type הוסר. בקשה אינה נושאת
  -- כוונה של בתשלום/התנדבות; התמחור כולו של העוזר, על ההצעה
  -- (offers.pricing_mode ∈ {fixed, volunteer, after_job}). מוצג כאן רק כתיעוד
  -- העיצוב לפני-0009; לסכימה החיה אין עמודת payment_type.
  payment_type  public.payment_type not null,
  -- request location, confirmed by the requester at publish time — NOT NULL:
  -- the spec (C3, §8.3, §9.3) makes location part of every request; a request
  -- helpers cannot locate defeats the distance-sorted marketplace (G3). The
  -- posting form captures/confirms it (profile default or on-the-spot prompt).
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  status        public.request_status not null default 'open',
  is_hidden     boolean not null default false,          -- admin moderation flag
  assigned_offer_id      uuid,                           -- FK added below (circular)
  completed_by_requester boolean not null default false,
  completed_by_helper    boolean not null default false,
  is_paid       boolean not null default false,          -- owner's marker, via mark_paid RPC
  created_at    timestamptz not null default now(),
  assigned_at   timestamptz,
  completed_at  timestamptz,
  rated_at      timestamptz,
  cancelled_at  timestamptz
);

create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.help_requests(id) on delete cascade,
  helper_id      uuid not null references public.profiles(id) on delete cascade,
  status         public.offer_status not null default 'active',
  message        text not null check (char_length(message) between 5 and 1000),
  -- three pricing stances (migration 0010): a helper often cannot quote before
  -- seeing the problem. pricing_mode:
  --   'fixed'     → price set now (price column)
  --   'volunteer' → free (both price columns null)
  --   'after_job' → priced once the work is done (final_price set later via the
  --                 set_final_price RPC, when the request is completed)
  pricing_mode   public.pricing_mode not null default 'volunteer',
  price          numeric(10,2) check (price is null or (price > 0 and price <= 99999.99)),
  final_price    numeric(10,2) check (final_price is null or (final_price > 0 and final_price <= 99999.99)),
  constraint price_matches_mode check (
    (pricing_mode = 'fixed'     and price is not null) or
    (pricing_mode = 'volunteer' and price is null and final_price is null) or
    (pricing_mode = 'after_job' and price is null)
  ),
  -- any of the three stances is allowed on any request (migration 0011 removed
  -- the old "charging only on paid requests" cross-table rule).
  -- snapshot set by trigger T4 at insert: /my/offers must render meaningfully
  -- even after the offerer loses SELECT on the parent request (spec §9.2)
  request_title  text not null default '',
  created_at     timestamptz not null default now()
);

-- Spec §9.2: one *active* offer per helper per request. Withdrawn/closed rows
-- do not block a new offer (withdraw-then-reoffer is allowed while open).
create unique index one_active_offer_per_helper
  on public.offers (request_id, helper_id) where (status = 'active');

-- Circular FK, added after both tables exist:
alter table public.help_requests
  add constraint fk_assigned_offer
  foreign key (assigned_offer_id) references public.offers(id);

create table public.request_photos (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.help_requests(id) on delete cascade,
  storage_path text not null,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.ratings (
  -- PK on request_id: one rating per request, by construction (spec §9.2)
  request_id uuid primary key references public.help_requests(id) on delete cascade,
  helper_id  uuid not null references public.profiles(id) on delete cascade,
  rater_id   uuid not null references public.profiles(id) on delete cascade,
  stars      int not null check (stars between 1 and 5),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
```

**אגרגטים של דירוגים מחושבים, לא מאוחסנים.** דפי פרופיל של עוזרים ורשימות
הצעות קוראים `avg(stars), count(*)` מקובצים לפי `helper_id` בשאילתה אחת. בקנה
המידה של ה-MVP זה זול לחלוטין, תמיד נכון, וללא אנומליית עדכון;
מונים מנורמלים-לאחור הם היורש הנקוב במסמך קנה-המידה.

### 1.3 אינדקסים (מעבר ל-PKs ולשני ה-partial uniques)

```sql
create index idx_requests_browse  on public.help_requests (status, is_hidden, created_at desc);
create index idx_requests_owner   on public.help_requests (requester_id, created_at desc);
create index idx_offers_request   on public.offers (request_id) where status = 'active';
create index idx_offers_helper    on public.offers (helper_id, created_at desc);
create index idx_photos_request   on public.request_photos (request_id, position);
create index idx_ratings_helper   on public.ratings (helper_id);
create index idx_applications_queue on public.verification_applications (status, created_at)
  where status = 'pending';
```

כל אינדקס ממופה לעמוד: פיד העיון, הבקשות-שלי, פירוט בקשה (הצעות +
תמונות), ההצעות-שלי, פרופיל עוזר, תור המנהל.

---

## 2. Row Level Security — כל מדיניות, עם ההצדקה שלה

RLS מופעל על כל שבע הטבלאות (`alter table … enable row level security`).
אף טבלה אינה מעניקה דבר ל-`anon` — כל מדיניות מכוונת ל-`authenticated`.
אין במכוון **שום מדיניות INSERT** על `help_requests`, `request_photos`
ו-`ratings`: ה-inserts הללו מתרחשים רק בתוך RPCs מסוג SECURITY DEFINER, וזה
מה שהופך את האינווריאנטים שלהם (החלפת מצב אטומית) לבלתי-ניתנים-לעקיפה.

### פונקציית עזר

```sql
-- SECURITY DEFINER so policies can check adminship without profiles_private
-- being readable; STABLE so the planner caches it per statement.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles_private where user_id = auth.uid()),
    false);
$$;

create or replace function public.is_identity_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_identity_verified from public.profiles where id = auth.uid()),
    false);
$$;

-- Breaks the policy recursion cycle: help_requests' SELECT policy must ask
-- "is the caller the selected helper?", which reads offers — but offers'
-- SELECT policy reads help_requests back. Cross-referencing policies recurse
-- ("infinite recursion detected in policy"); a SECURITY DEFINER lookup on one
-- side terminates the chain.
create or replace function public.is_selected_helper(p_assigned_offer_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.offers o
    where o.id = p_assigned_offer_id and o.helper_id = auth.uid());
$$;
```

### `profiles`

| מדיניות | תנאי SQL | אוכפת (מפרט) |
|---|---|---|
| `profiles_select` (SELECT) | `true` (authenticated) | כרטיסי עוזרים, רשימות הצעות ו-`/helpers/[id]` מציגים את השם + התגים של כל משתמש — רק עמודות ציבוריות-בתכנון (§4.3) |
| `profiles_update_own` (UPDATE) | USING/CHECK `id = auth.uid()` | רק אתה עורך את הפרופיל שלך; טריגר שומר-העמודות (§4 להלן) מחזיק את שני דגלי האימות מחוץ להישג יד |

אין מדיניות INSERT/DELETE — שורות נוצרות על ידי טריגר ההרשמה ומתות עם
מחיקת-השרשור של `auth.users`.

### `profiles_private`

| מדיניות | תנאי SQL | אוכפת |
|---|---|---|
| `private_select_own` (SELECT) | `user_id = auth.uid()` | טלפון וקואורדינטות-בית ניתנים לקריאה על ידי הבעלים בלבד (§9.3); ה-RPC של יצירת הקשר הוא הנתיב הבין-משתמשי היחיד |
| `private_update_own` (UPDATE) | USING/CHECK `user_id = auth.uid()` | הבעלים עורך טלפון/מיקום; `is_admin` מוגן על ידי שומר-העמודות — **ללא השומר, מדיניות זו הייתה מאפשרת לכל משתמש לקבוע `is_admin = true` על השורה שלו**. השומר גם חוסם *הסרת* טלפון לאחר שנקבע (שינוי מותר, null לא) — זרימת חשיפת-הקשר לעולם אסור שתציג טלפון ריק עבור משתמש מאומת |

### `verification_applications`

| מדיניות | תנאי SQL | אוכפת |
|---|---|---|
| `applications_select` (SELECT) | `user_id = auth.uid() or public.is_admin()` | המבקש רואה את ההיסטוריה + הסטטוס שלו; מנהלים רואים את התור (§9.2) |
| `applications_insert` (INSERT) | `user_id = auth.uid() and (kind = 'identity' or public.is_identity_verified()) and status = 'pending' and admin_note is null and decided_by is null and decided_at is null and (doc_path is null or doc_path like auth.uid()::text \|\| '/%')` | כל אחד מגיש בקשת זהות; בקשת מקצוענות מחייבת זהות מאושרת (§9.2); ה-partial unique index חוסם בקשה פתוחה שנייה. קיבועי ה-`status`/`decided_*` הופכים את "החלטות עוברות רק דרך `review_application`" לנכון *מעצם התכנון* — בלעדיהם insert מזויף מזייף שורת-ביקורת שכבר-אושרה; קיבוע קידומת ה-`doc_path` עוצר הפניה לתעודת-זהות/תעודה של מישהו אחר |

אין UPDATE/DELETE למשתמשים: בקשות בלתי-ניתנות-לשינוי לאחר הגשה (הגשה-מחדש
יוצרת שורה חדשה — *זה* מסלול הביקורת); החלטות עוברות רק דרך
`review_application`.

### `help_requests`

| מדיניות | תנאי SQL | אוכפת |
|---|---|---|
| `requests_select` (SELECT) | `(status in ('open','has_offers') and not is_hidden) or requester_id = auth.uid() or public.is_admin() or public.is_selected_helper(assigned_offer_id)` | חוק התצוגה של §9.2 מילה במילה: כולם רואים את הפיד החי פחות המוסתרים; הבעלים, העוזר הנבחר והמנהלים רואים גם מצבים מאוחרים ושורות מוסתרות. בדיקת העוזר-הנבחר עוברת דרך פונקציית ה-definer כדי להימנע מרקורסיית-מדיניות עם `offers` |
| `requests_update_own` (UPDATE) | USING `requester_id = auth.uid() and status in ('open','has_offers')` CHECK `requester_id = auth.uid()` | הבעלים עורך תוכן כל עוד ניתן לעריכה (§9.2); אילו *עמודות* מותר לשנות זה תפקידו של טריגר השומר. **זו במכוון מדיניות ה-UPDATE היחידה על הטבלה**: מדיניות permissive מבצעת OR על ה-USING וה-WITH CHECK שלהן באופן עצמאי, ולכן מדיניות "סמן כשולם" שנייה הייתה מאפשרת לבקשה שהושלמה-ושולמה לעבור את ה-USING שלה בעוד ה-CHECK הרופף של מדיניות עריכת-התוכן מקבל תוכן חדש שרירותי — פותח מחדש עריכות על עבודות שהסתיימו. סמן-התשלום עובר לפיכך דרך ה-RPC `mark_paid` במקום |

אין INSERT (RPC בלבד), אין DELETE (ביטול הוא מצב, לא הסרת שורה —
הצעות ודירוגים מפנים לשורה לעד).

### `offers`

| מדיניות | תנאי SQL | אוכפת |
|---|---|---|
| `offers_select` (SELECT) | `helper_id = auth.uid() or exists (select 1 from public.help_requests r where r.id = request_id and r.requester_id = auth.uid())` | נראוּת של מכרז-אטום: בעל ההצעה + בעל הבקשה, אף אחד אחר — כולל מנהלים (§9.2) |
| `offers_insert` (INSERT) | `helper_id = auth.uid() and status = 'active' and final_price is null and public.is_identity_verified() and exists (select 1 from public.help_requests r where r.id = request_id and r.requester_id <> auth.uid() and r.status in ('open','has_offers') and not r.is_hidden)` | משתמשים מאומתים בלבד; לא על בקשה עצמית; כל עמדת תמחור על כל בקשה (מיגרציה 0011); רק כל עוד הבקשה פתוחה/has_offers וגלויה (§9.2); active כפול נחסם על ידי ה-partial unique index. **`status = 'active'` מקבע מצב-לידה** — בלעדיו insert מזויף יוצר הצעה שנולדת `selected` (מזייף את תצוגת-ההשוואה של המבקש ושורד את הסריקה active-בלבד של `assign_offer`) או שנולדת `closed`/`withdrawn` (מתחמק מאינדקס הייחודיות). **`final_price is null` מקבע את ה-insert** (מיגרציה 0013) — בלעדיו insert מזויף מסוג after_job מפברק את הסכום "המוסכם" ש-`mark_paid` מבצע עליו coalesce, ועוקף את כל שרשרת השומרים של `set_final_price` |
| `offers_update_own` (UPDATE) | USING `helper_id = auth.uid() and status = 'active'` CHECK `helper_id = auth.uid() and status in ('active','withdrawn')` | עריכה או משיכה כל עוד active. הקבוצה הסגורה של ה-CHECK היא מה שעוצר עוזר מלבצע PATCH על ההצעה שלו ל-`selected` — שני המצבים היחידים שעוזר יכול לכתוב הם השניים שבבעלותו (§9.2). `request_id`, `helper_id`, `pricing_mode`, `final_price`, `created_at` מוגנים על ידי שומר-העמודות (להלן) — אחרת UPDATE היה יכול *להצביע-מחדש* על הצעה active לבקשה אחרת, ולעקוף כל בדיקת INSERT (בקשה-עצמית, מצב-פתוח, מוסתר), או לכתוב `final_price` ישירות במקום דרך `set_final_price` |

אין DELETE — הצעות שנמשכו נשארות כהיסטוריה (וכרישום-הצעה-מחדש).

### `request_photos`

| מדיניות | תנאי SQL | אוכפת |
|---|---|---|
| `photos_select` (SELECT) | `exists (select 1 from public.help_requests r where r.id = request_id)` | משקף את נראוּת הבקשה-האב אוטומטית: תת-השאילתה עצמה מסוננת-RLS לפי הקורא, ולכן תמונות של בקשות מוסתרות/סגורות נעלמות בדיוק עבור המשתמשים שהבקשה נעלמת עבורם |

אין INSERT/UPDATE/DELETE: תמונות נוצרות על ידי ה-RPC והן **בלתי-ניתנות-לשינוי
לאחר מכן** — פישוט MVP מכוון (זרימת העריכה משנה שדות טקסט
בלבד, בהתאם למפרט).

### `ratings`

| מדיניות | תנאי SQL | אוכפת |
|---|---|---|
| `ratings_select` (SELECT) | `helper_id = auth.uid() or rater_id = auth.uid() or public.is_admin()` | ה*טבלה הבסיסית* מוגבלת-לצדדים: היא נושאת `rater_id` + `request_id`, ומדיניות `true` הייתה מאפשרת לכל משתמש מחובר לשאוב מי-דירג-את-מי בכל הפלטפורמה — קישוריות שהבקשה-האב (המדורגת, בלתי-נראית-ל-RLS) כבר אינה חושפת. צדדים שלישיים קוראים דירוגים דרך ה-view להלן |

```sql
-- The public rating surface (spec §9.2 "View rating | any signed-in user"):
-- stars + note + when, per helper — WITHOUT rater/request linkage. Postgres
-- views execute with the owner's rights by default, which is exactly the
-- column-slicing tool RLS lacks. Rater identity is deliberately not shown to
-- third parties; the helper can infer it from the request context anyway.
create view public.helper_ratings
  with (security_invoker = false) as
  select helper_id, stars, note, created_at from public.ratings;
grant select on public.helper_ratings to authenticated;
```

אין INSERT (RPC בלבד — ה-insert חייב לקדם אטומית את הבקשה למצב
*rated*), אין UPDATE/DELETE (בלתי-ניתן-לשינוי, מפרט §9.1).

### מדיניות אחסון (Storage)

```sql
-- bucket: request-photos (private bucket; policies on storage.objects)
create policy "photos_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'request-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_identity_verified());
create policy "photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'request-photos');

-- bucket: verification-docs
create policy "docs_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_read" on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
```

הגדרת ברמת-הבאקט: מגבלת גודל אובייקט של 5 MB, allowlist של MIME
(`image/jpeg`, `image/png`, `image/webp`). פער הרשאת-הקריאה הידוע על
`request-photos` (אובייקטים של בקשות מוסתרות נותרים ניתנים-לשליפה לפי נתיב) הוא
המגבלה המקובלת המתועדת בארכיטקטורה §5.

---

## 3. פונקציות בסיס הנתונים — גופים מלאים (מלאי הקוד המורשה)

מוסכמות לכל אחת-עשרה: `security definer set search_path = public`, הרשאת execute
שלולה מ-`public`/`anon` ומוענקת ל-`authenticated`, בדיקות הרשאה
תחילה, שגיאות עסקיות מוזרקות עם קודים יציבים שהאפליקציה ממפה לעברית
(`P0001` + הודעה ב-`not_found | forbidden | invalid_state | …`).

**חוק סדר-השגיאות (ללא דליפת קיום):** RPCs קוראים עם הרשאות definer, ולכן
סדר בדיקה נאיבי היה חושף שורות ש-RLS מסתיר — למשל, הזרקת `invalid_state`
עבור בקשה *מוסתרת* מגלה לקורא בודק שהשורה קיימת. החוק: **הזריקו
`not_found` בכל פעם שהקורא לא היה יכול לבצע SELECT על השורה תחת המדיניות**
(לא-בעלים, לא-צד), *לפני* כל בדיקת מצב; `invalid_state` ו-
`forbidden` מוזרקים אך ורק לקוראים שכבר יכולים לראות את השורה.
זה שומר על הבטחת §10 — מסורב וחסר בלתי-ניתנים-להבחנה.

```sql
-- 3.1 Create request + photos atomically; photos optional (0–5) and, when
-- supplied, path ownership is enforced.
-- ⚠️ הוחלף (SUPERSEDED) — חתימה: הפרמטר p_payment_type (והשימוש בו ב-
-- INSERT להלן) הוסר במיגרציה 0011. ה-RPC החי אינו מקבל ארגומנט תמחור
-- כלשהו — לבקשה אין כוונת בתשלום/התנדבות; התמחור חי על ההצעות.
-- ⚠️ הוחלף (SUPERSEDED) — אילוץ: מיגרציה 0015 הפכה את התצלומים לאופציונליים
-- (0–5) והסירה את בדיקת photos_required המוצגת להלן; ה-raise של
-- photos_required כבר אינו קיים. בלוק זה נשמר להמחשה בלבד.
create or replace function public.create_request_with_photos(
  p_title text, p_description text, p_category text,
  p_payment_type public.payment_type,   -- removed in 0011
  p_lat double precision, p_lng double precision,
  p_photo_paths text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_path text;
  v_paths text[];
begin
  if not public.is_identity_verified() then
    raise exception 'forbidden';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'location_required';
  end if;

  -- deduplicate, then bound: 0–5 distinct photos (photos optional since 0015;
  -- the photos_required raise shown here was removed in migration 0015)
  select array_agg(distinct p) into v_paths from unnest(p_photo_paths) as p;
  if array_length(v_paths, 1) > 5 then
    raise exception 'too_many_photos';
  end if;
  foreach v_path in array v_paths loop
    -- photos must live in the caller's own storage folder
    if v_path not like auth.uid()::text || '/%' then
      raise exception 'forbidden';
    end if;
  end loop;
  -- every path must be a real object in the right bucket (definer read of
  -- storage.objects): blocks nonexistent paths and verification-docs paths,
  -- which share the same {uid}/ folder convention
  if (select count(*) from storage.objects
      where bucket_id = 'request-photos' and name = any(v_paths))
     <> array_length(v_paths, 1) then
    raise exception 'photo_not_uploaded';
  end if;

  -- ⚠️ הוחלף (SUPERSEDED): עמודת/ארגומנט payment_type הוסרו במיגרציה 0011.
  insert into public.help_requests
    (requester_id, title, description, category, payment_type, lat, lng)
  values
    (auth.uid(), p_title, p_description, p_category, p_payment_type, p_lat, p_lng)
  returning id into v_id;

  insert into public.request_photos (request_id, storage_path, position)
  select v_id, u.path, u.ord - 1
  from unnest(v_paths) with ordinality as u(path, ord);

  return v_id;
end $$;

-- 3.2 Assign: the pivotal moment. Guarded updates close the withdraw race;
-- the FOR UPDATE lock serializes concurrent assigns.
create or replace function public.assign_offer(p_request_id uuid, p_offer_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_requester uuid;
begin
  select requester_id into v_requester
    from public.help_requests where id = p_request_id for update;
  -- error-ordering rule: non-owner gets not_found, same as a missing row
  if v_requester is null or v_requester <> auth.uid() then
    raise exception 'not_found';
  end if;

  update public.help_requests
     set status = 'assigned', assigned_offer_id = p_offer_id, assigned_at = now()
   where id = p_request_id and status = 'has_offers';
  if not found then raise exception 'invalid_state'; end if;

  update public.offers
     set status = 'selected'
   where id = p_offer_id and request_id = p_request_id and status = 'active';
  if not found then raise exception 'offer_not_active'; end if;  -- rolls back both

  update public.offers
     set status = 'closed'
   where request_id = p_request_id and status = 'active';
end $$;

-- 3.3 Dual-sided completion: caller's side derived from identity, never a parameter.
create or replace function public.confirm_completion(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_helper uuid;
begin
  select * into v_req from public.help_requests
    where id = p_request_id for update;
  if not found then raise exception 'not_found'; end if;

  select helper_id into v_helper from public.offers where id = v_req.assigned_offer_id;
  -- error-ordering rule: party check BEFORE state check — a non-party probing
  -- a hidden/cancelled id must learn nothing, not even "wrong state"
  if auth.uid() <> v_req.requester_id and (v_helper is null or auth.uid() <> v_helper) then
    raise exception 'not_found';
  end if;
  if v_req.status <> 'assigned' then raise exception 'invalid_state'; end if;

  if auth.uid() = v_req.requester_id then
    update public.help_requests set completed_by_requester = true where id = p_request_id;
  else
    update public.help_requests set completed_by_helper = true where id = p_request_id;
  end if;

  update public.help_requests
     set status = 'completed', completed_at = now()
   where id = p_request_id and status = 'assigned'
     and completed_by_requester and completed_by_helper;
end $$;

-- 3.4 Cancel: owner-only, terminal, closes all live offers (cross-owner writes).
create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_requester uuid;
begin
  select requester_id into v_requester
    from public.help_requests where id = p_request_id for update;
  if v_requester is null or v_requester <> auth.uid() then
    raise exception 'not_found';   -- error-ordering rule
  end if;

  update public.help_requests
     set status = 'cancelled', cancelled_at = now()
   where id = p_request_id and status in ('open','has_offers','assigned');
  if not found then raise exception 'invalid_state'; end if;

  update public.offers
     set status = 'closed'
   where request_id = p_request_id and status in ('active','selected');
end $$;

-- 3.5 Rating: insert + completed→rated flip in one transaction.
create or replace function public.submit_rating(
  p_request_id uuid, p_stars int, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_helper uuid;
begin
  select * into v_req from public.help_requests
    where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_found';   -- error-ordering rule
  end if;
  if v_req.status <> 'completed' then raise exception 'invalid_state'; end if;

  select helper_id into v_helper from public.offers where id = v_req.assigned_offer_id;

  insert into public.ratings (request_id, helper_id, rater_id, stars, note)
  values (p_request_id, v_helper, auth.uid(), p_stars, nullif(trim(p_note), ''));

  update public.help_requests
     set status = 'rated', rated_at = now()
   where id = p_request_id;
end $$;

-- 3.6 Admin: decide an application; flags update atomically with the decision.
create or replace function public.review_application(
  p_application_id uuid, p_approve boolean, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_app public.verification_applications%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select * into v_app from public.verification_applications
    where id = p_application_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_app.status <> 'pending' then raise exception 'invalid_state'; end if;
  -- a rejection must carry a reason (spec §4.1: "rejects with a note")
  if not p_approve and nullif(trim(p_note), '') is null then
    raise exception 'note_required';
  end if;
  -- a professional badge on a revoked identity is meaningless: re-check the
  -- gate at decision time, not just at application time
  if p_approve and v_app.kind = 'professional' and not exists (
    select 1 from public.profiles
    where id = v_app.user_id and is_identity_verified
  ) then
    raise exception 'invalid_state';
  end if;

  update public.verification_applications
     set status     = case when p_approve then 'approved' else 'rejected' end,
         admin_note = p_note,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_application_id;

  if p_approve then
    if v_app.kind = 'identity' then
      update public.profiles set is_identity_verified = true where id = v_app.user_id;
      -- the reviewed phone becomes the live contact channel (spec §8.2)
      update public.profiles_private set phone = v_app.phone where user_id = v_app.user_id;
    else
      update public.profiles set is_professional = true where id = v_app.user_id;
    end if;
  end if;
end $$;

-- 3.7 Admin: revoke. Identity revocation also drops the professional badge
-- (professional requires identity, spec §9.2).
create or replace function public.revoke_verification(
  p_user_id uuid, p_kind public.application_kind
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  update public.verification_applications
     set status = 'revoked', decided_by = auth.uid(), decided_at = now()
   where user_id = p_user_id and kind = p_kind and status = 'approved';
  if not found then raise exception 'not_found'; end if;

  if p_kind = 'identity' then
    update public.profiles
       set is_identity_verified = false, is_professional = false
     where id = p_user_id;
    -- professional rides on identity: revoke approved AND pending professional
    -- applications — otherwise a surviving pending row could later be approved
    -- onto a revoked identity
    update public.verification_applications
       set status = 'revoked', decided_by = auth.uid(), decided_at = now()
     where user_id = p_user_id and kind = 'professional'
       and status in ('approved','pending');
  else
    update public.profiles set is_professional = false where id = p_user_id;
  end if;
end $$;

-- 3.8 Admin: moderation flag only — lifecycle state untouched by construction.
create or replace function public.set_request_hidden(
  p_request_id uuid, p_hidden boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.help_requests set is_hidden = p_hidden where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
end $$;

-- 3.9 Paid marker: RPC rather than an UPDATE policy on purpose — a second
-- permissive UPDATE policy on help_requests would OR its USING with the
-- content-edit policy's lax CHECK and reopen content edits on finished jobs.
create or replace function public.mark_paid(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_offer public.offers%rowtype;
  v_agreed numeric;
begin
  select * into v_req from public.help_requests where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_found';   -- error-ordering rule
  end if;
  -- keyed to the AGREED amount: a fixed quote OR a set after_job final price
  -- (a volunteered job has nothing to mark as paid)
  select * into v_offer from public.offers where id = v_req.assigned_offer_id;
  v_agreed := coalesce(v_offer.price, v_offer.final_price);  -- fixed OR set after_job
  if v_req.status not in ('completed','rated')
     or v_agreed is null or v_req.is_paid then
    raise exception 'invalid_state';
  end if;
  update public.help_requests set is_paid = true where id = p_request_id;
end $$;

-- 3.10 After-job pricing (migration 0010): the selected helper of an
-- `after_job` offer sets the final amount once the request is completed
-- (or rated — the requester may still mark paid). Guarded: selected helper
-- only, after_job only, once.
create or replace function public.set_final_price(p_request_id uuid, p_price numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_offer public.offers%rowtype;
begin
  if p_price is null or p_price <= 0 or p_price > 99999.99 then
    raise exception 'invalid_price';
  end if;

  select * into v_req from public.help_requests where id = p_request_id for update;
  if not found then raise exception 'not_found'; end if;

  select * into v_offer from public.offers where id = v_req.assigned_offer_id;
  -- error-ordering rule: only the selected helper can price; anyone else 404s
  if v_offer.helper_id is null or v_offer.helper_id <> auth.uid() then
    raise exception 'not_found';
  end if;
  if v_req.status not in ('completed','rated')
     or v_offer.pricing_mode <> 'after_job'
     or v_offer.final_price is not null then
    raise exception 'invalid_state';
  end if;

  update public.offers set final_price = p_price where id = v_offer.id;
end $$;

-- 3.11 The only read RPC: counterpart contact, post-assignment, parties only.
create or replace function public.get_counterpart_contact(p_request_id uuid)
returns table (display_name text, phone text)
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_helper uuid;
  v_other uuid;
begin
  select * into v_req from public.help_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;

  select helper_id into v_helper from public.offers where id = v_req.assigned_offer_id;
  -- error-ordering rule: party check first — probing a hidden/cancelled id
  -- must not reveal that the row exists or what state it is in
  if auth.uid() = v_req.requester_id then v_other := v_helper;
  elsif v_helper is not null and auth.uid() = v_helper then v_other := v_req.requester_id;
  else raise exception 'not_found';
  end if;

  if v_req.status not in ('assigned','completed','rated') then
    raise exception 'invalid_state';
  end if;

  return query
    select p.display_name, pp.phone
    from public.profiles p
    join public.profiles_private pp on pp.user_id = p.id
    where p.id = v_other;
end $$;
```

### טריגרים (ארבע פונקציות)

```sql
-- T1: signup — create both profile rows.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.profiles_private (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- T2: offer lifecycle keeps request open ↔ has_offers true, and closes the
-- race where an offer lands on a just-assigned request.
create or replace function public.sync_request_offer_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid := coalesce(new.request_id, old.request_id);
  v_status public.request_status;
  v_active int;
begin
  select status into v_status from public.help_requests
    where id = v_request_id for update;              -- waits out concurrent assign/cancel

  if v_status in ('open','has_offers') then
    select count(*) into v_active from public.offers
      where request_id = v_request_id and status = 'active';
    update public.help_requests
       set status = case when v_active > 0 then 'has_offers' else 'open' end
     where id = v_request_id and status <> (case when v_active > 0
       then 'has_offers'::public.request_status else 'open'::public.request_status end);
  elsif tg_op = 'INSERT' and new.status = 'active' then
    -- request left the offerable states while this insert was in flight
    update public.offers set status = 'closed' where id = new.id;
  end if;
  return new;
end $$;
create trigger on_offer_change after insert or update of status on public.offers
  for each row execute function public.sync_request_offer_status();

-- T3: column guard — RLS cannot restrict WHICH columns an UPDATE changes.
-- Direct (PostgREST) writes run as role 'authenticated'; the definer RPCs run
-- as the function owner. The guard rejects protected-column changes for
-- 'authenticated' and lets the privileged path through.
-- NOTE: deliberately *invoker-rights* (not SECURITY DEFINER) — the mechanism
-- depends on current_user being the CALLER's role; search_path pinned anyway.
create or replace function public.guard_protected_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;                                       -- privileged path (RPCs, SQL console)
  end if;

  if tg_table_name = 'profiles' then
    if new.is_identity_verified is distinct from old.is_identity_verified
       or new.is_professional  is distinct from old.is_professional then
      raise exception 'forbidden';
    end if;
  elsif tg_table_name = 'profiles_private' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'forbidden';
    end if;
    -- a phone may be changed but never removed once set: the contact-reveal
    -- flow must not surface an empty phone for a verified user
    if old.phone is not null and new.phone is null then
      raise exception 'forbidden';
    end if;
  elsif tg_table_name = 'offers' then
    if new.request_id is distinct from old.request_id
       or new.helper_id is distinct from old.helper_id
       or new.request_title is distinct from old.request_title
       or new.pricing_mode is distinct from old.pricing_mode
       or new.final_price is distinct from old.final_price   -- set_final_price RPC only
       or new.created_at is distinct from old.created_at then
      raise exception 'forbidden';
    end if;
  elsif tg_table_name = 'help_requests' then
    if new.status is distinct from old.status
       or new.is_hidden is distinct from old.is_hidden
       or new.assigned_offer_id is distinct from old.assigned_offer_id
       or new.completed_by_requester is distinct from old.completed_by_requester
       or new.completed_by_helper is distinct from old.completed_by_helper
       or new.requester_id is distinct from old.requester_id
       or new.created_at is distinct from old.created_at
       or new.assigned_at is distinct from old.assigned_at
       or new.completed_at is distinct from old.completed_at
       or new.rated_at is distinct from old.rated_at
       or new.cancelled_at is distinct from old.cancelled_at
       or new.is_paid is distinct from old.is_paid then   -- is_paid: mark_paid RPC only
      raise exception 'forbidden';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profiles before update on public.profiles
  for each row execute function public.guard_protected_columns();
create trigger guard_profiles_private before update on public.profiles_private
  for each row execute function public.guard_protected_columns();
create trigger guard_help_requests before update on public.help_requests
  for each row execute function public.guard_protected_columns();
create trigger guard_offers before update on public.offers
  for each row execute function public.guard_protected_columns();

-- T4: offer-insert preparation (invoker-rights: the parent request is visible
-- to the inserter by policy). Normalizes server-controlled fields and takes
-- the title snapshot /my/offers renders after the parent becomes invisible.
create or replace function public.prepare_offer_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();                       -- never caller-supplied
  select title into new.request_title
    from public.help_requests where id = new.request_id;
  return new;
end $$;
create trigger on_offer_insert before insert on public.offers
  for each row execute function public.prepare_offer_insert();
```

---

## 4. מפת CRUD (מטלה: CREATE/READ/UPDATE/DELETE מרכזי)

| ישות | Create | Read | Update | Delete |
|---|---|---|---|---|
| פרופיל (ציבורי+פרטי) | טריגר ההרשמה | שורה ציבורית: כל מחובר; שורה פרטית: הבעלים | הבעלים (שם, טלפון, מיקום); דגלים רק דרך `review_application` / `revoke_verification` | שרשור עם החשבון |
| בקשת אימות | המבקש (מדיניות INSERT) | המבקש + מנהלים | החלטה רק דרך ה-RPC `review_application` | לעולם לא (מסלול ביקורת) |
| בקשת עזרה | ה-RPC `create_request_with_photos` | חוק הפיד / הבעלים / העוזר הנבחר / מנהל | עריכת תוכן של הבעלים (open/has_offers); מעברים דרך RPCs; `is_paid` דרך ה-RPC `mark_paid` | לעולם לא — `cancelled` הוא מצב; שורות שומרות היסטוריית הצעה/דירוג |
| תמונת בקשה | אותו RPC (0–5) | משקף את הבקשה-האב | לעולם לא (קבוצה בלתי-ניתנת-לשינוי) | שרשור עם הבקשה |
| הצעה | העוזר (מדיניות INSERT) | בעל ההצעה + בעל הבקשה | הבעלים עורך/מושך כל עוד active; `selected`/`closed` דרך RPCs | לעולם לא — withdrawn הוא מצב |
| דירוג | ה-RPC `submit_rating` | צדדים + מנהלים על הטבלה הבסיסית; כל השאר דרך ה-view `helper_ratings` (ללא קישוריות למדרג) | לעולם לא | לעולם לא |

תאי "לעולם לא" הם החלטות, לא השמטות: מסלולי ביקורת והיסטוריה רפרנציאלית
גוברים על מחיקות-קשיחות בכל מקום בתחום הזה (שרשורי מחיקת-חשבון הם
החריגה היחידה, מואצלים לשרשור `auth.users` של Supabase).

---

## 5. תיאור ה-API

מלאי הפעולות המלא הוא ארכיטקטורה §7. פרטי החוזה:

- **תעבורה (Transport):** Server Actions (POST, same-origin, מזהי action מוצפנים של Next.js).
  אין משטח REST ציבורי; נקודת-הקצה PostgREST של ה-DB *כן* ניתנת-להשגה עם
  ה-anon key אך חושפת רק את מה ש-RLS מעניק — זהו המשטח המבוקר.
- **טיפוס תוצאת פעולה** (אחיד):

```ts
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> };
```

- **מיפוי שגיאות RPC** (הודעת `RAISE EXCEPTION` של Postgres → מחרוזת UI בעברית):

| קוד | משמעות | UI (עברית) |
|---|---|---|
| `not_found` | שורה נעדרת או בלתי-נראית לקורא | "הבקשה לא נמצאה" |
| `forbidden` | לקורא אין את ההרשאה | "אין לך הרשאה לפעולה זו" |
| `invalid_state` | מכונת-המצבים אוסרת את המעבר | "הפעולה אינה זמינה במצב הנוכחי" |
| `offer_not_active` | Assign התנגש עם משיכה | "ההצעה כבר אינה זמינה — רעננו את העמוד" |
| `too_many_photos` | סופקו יותר מ-5 תמונות (התצלומים אופציונליים; `photos_required` כבר אינו מופעל החל ממיגרציה 0015) | "ניתן לצרף עד 5 תמונות" |
| `photo_not_uploaded` | לנתיב תמונה אין אובייקט שהועלה מאחוריו | "העלאת התמונות נכשלה — נסו שוב" |
| `location_required` | בקשה פורסמה ללא קואורדינטות | "יש לאשר מיקום לבקשה" |
| `invalid_price` | מחיר סופי מחוץ לטווח (`set_final_price`) | "סכום לא תקין" |
| `note_required` | מנהל דחה ללא נימוק | "דחייה מחייבת נימוק" |
| *(סירוב RLS / אין שורות)* | הרשאה נדחתה ברמת המדיניות | אותה הודעה גנרית "אין הרשאה" — במכוון בלתי-ניתנת-להבחנה מ-not-found |

**דפוס הסירוב-השקט לעדכונים ישירים:** שורות שסעיף ה-USING של מדיניות UPDATE
מסנן החוצה *מדולגות בשקט* — PostgREST מדווח על הצלחה עם אפס
שורות מושפעות, לא שגיאה. כל פעולת עדכון-ישיר (`updateRequest`,
`updateOffer`, `withdrawOffer`, `updateProfile`) לפיכך משרשרת `.select()`
ומתייחסת לתוצאה ריקה כסירוב, ממופה לאותה הודעה גנרית.
רק הפרות WITH CHECK, הזרקות constraint/trigger, והזרקות RPC מגיעות כשגיאות
Postgres.

- **קריאות:** Server Components משתמשים בלקוח Supabase של-כל-בקשה. שלוש
  צורות הקריאה השוות ציון: הפיד (**`status in ('open','has_offers') and not
  is_hidden`** — התואם ל-`idx_requests_browse`; "open" בפרוזה תמיד משמעו
  "עדיין לא הוקצה" — מוגבל ל-200, ממוין-Haversine ב-`lib/geo.ts`, ממוספר-בזיכרון
  — ארכיטקטורה §8.1), פירוט הבקשה (בקשה + תמונות + הצעות
  הנראות לקורא + דירוג + RPC יצירת-קשר כשמוקצה), ופרופיל העוזר
  (פרופיל ציבורי + אגרגט ורשימה מה-view `helper_ratings`).

- **הגשת תמונות:** שני הבאקטים פרטיים, ולכן `<img src>` אינו יכול להתייחס
  אליהם ישירות. Server Components יוצרים **signed URLs בכמות (bulk)**
  (`storage.createSignedUrls`, קריאה אחת לכל עמוד מוצג, פקיעה של שעה —
  התואמת לרעננוּת בזמן-ניווט) עבור תמונות בקשה, ובתור המנהל,
  עבור מסמכי אימות. החתימה רצה כמשתמש המחובר, ולכן
  אותה מדיניות אחסון מאשרת אותה; URLs פוקעים במקום לחיות לנצח
  ב-HTML.

---

## 6. לוגיקה עסקית מרכזית

טבלה אחת — מעבר × שחקן × מנגנון (מכונת §9.1 של המפרט, מוּעברת
לפעולה):

| מעבר | שחקן | מנגנון |
|---|---|---|
| → `open` (פרסום) | בעלים מאומת | `create_request_with_photos` |
| `open ↔ has_offers` | המערכת | טריגר T2 בהוספה/משיכה של הצעה |
| `has_offers → assigned` | הבעלים | `assign_offer` (נועל, שומר, סוגר מתחרים) |
| `assigned`: קביעת דגל השלמה עצמי | הבעלים / העוזר הנבחר | `confirm_completion` (הצד מ-`auth.uid()`) |
| `assigned → completed` | המערכת (שני הדגלים true) | אותו RPC, אותה טרנזקציה |
| `completed → rated` | הבעלים | `submit_rating` (insert + flip, אטומי) |
| מחיר סופי של `after_job` | העוזר הנבחר | `set_final_price` (completed/rated, הצעת after_job, פעם אחת) |
| סמן `is_paid` | הבעלים | `mark_paid` (לאחר-השלמה, סכום מוסכם = `coalesce(price, final_price)`, פעם אחת) |
| כל טרום-completed → `cancelled` | הבעלים | `cancel_request` (סוגר הצעות חיות) |
| החלפת `is_hidden` | מנהל | `set_request_hidden` |
| החלטה / ביטול אימות | מנהל | `review_application` / `revoke_verification` |

מרחק: `lib/geo.ts` מממש Haversine (`~15` שורות, טהור, נבדק-יחידה).
כל בקשה נושאת קואורדינטות (NOT NULL — §1.2); ל*צופה* עשוי לחסר
מיקום, ובמקרה כזה הפיד מוצג חדש-קודם ללא מרחקים (מפרט
C4 fallback). מיקומו-שלו של הצופה מגיע משורת `profiles_private` שלו
(קריאת שורה-עצמית).

---

## 7. רכיבים (רכיבי React מרכזיים והטיפוס שלהם)

| רכיב | סוג | הערות |
|---|---|---|
| `(app)/layout` | Server | ניווט, קריאת סשן, הפניית onboarding (שם תצוגה ריק → `/profile`) |
| `RequestCard`, `RequestList` | Server | הצגת פיד + הבקשות-שלי; צ'יפ מרחק |
| `RequestDetail` | Server | מרכיב תמונות, פאנל סטטוס, הצעות/דירוג/קשר לפי תפקיד |
| `RequestForm` | Client | יצירה/עריכה; zod client-parse; עוטף את `PhotoUploader` |
| `PhotoUploader` | Client | העלאה ישירה-לאחסון, עד 5 קבצים (אופציונלי), בדיקות גודל/סוג, מחזיר נתיבים |
| `OfferList`, `OfferCard` | Server | הבעלים רואה את כל ההצעות + תגי/דירוגי עוזרים; העוזר רואה את שלו |
| `OfferForm`, `WithdrawButton` | Client | יצירה/עריכה/משיכה של הצעה |
| `AssignButton` | Client | דיאלוג אישור → `assignOffer` |
| `CompletionPanel` | Server + כפתור client | מציג את שני הדגלים ("ממתין לצד השני"), `confirmCompletion` |
| `ContactCard` | Server | מציג תוצאת `get_counterpart_contact` לאחר-הקצאה |
| `RatingForm`, `Stars` | Client / Server | קלט 1–5 כוכבים; תצוגה לקריאה-בלבד עם ממוצע |
| `VerificationForm` | Client | בקשת זהות/מקצוענות כולל העלאת מסמך |
| `AdminQueue`, `ModerationList` | Server + פעולות client | אישור/דחייה עם נימוק; הסתרה/ביטול-הסתרה; ביטול אימות |
| `GeolocationPrompt` | Client | לכידה חד-פעמית ב-`/profile`; כותב דרך `updateProfile` |
| `MapView`, `RequestsMap`/`FeedMap`, `MapPicker` | Client | מפות Leaflet: מיקום בקשה, סיכות פיד + חלוניות, לחיצה-לבחירת-מיקום. אריחים (Tiles) הם התלות היחידה בזמן-ריצה של צד-שלישי — אריחי raster של OpenStreetMap: לתצוגה-בלבד, ללא-מפתח, חינמיים; תקלת שרת-אריחים מתדרדרת לריבוע מפה ריק, לעולם לא שוברת זרימה |
| `EmptyState`, `StatusChip`, `OfferPriceChip`, `Badge` | Server | אוצר-מילים UI משותף; `OfferPriceChip` מציג את עמדת התמחור של ההצעה (מחיר קבוע / התנדבות / after-job) |

רכיבי Client הם עלים; כל עמוד הוא Server Component המושך נתונים
ומעביר props רגילים כלפי מטה. אין context providers מלבד מודול המחרוזות
נטול-RTL/i18n (imports רגילים).

---

## 8. ניהול מצב (State Management)

- **URL = מצב רשימה:** מסנני הפיד (קטגוריה, מרחק) ומספר העמוד
  הם search params — ניתנים-לשיתוף, נכונים-לכפתור-חזור, אפס cache בצד-לקוח.
- **טפסים:** `useActionState(action)` לכל טופס; מצב pending מ-
  `useFormStatus`. לאחר הצלחה, `revalidatePath` (נתיבים קונקרטיים) מרענן
  כל Server Component מושפע — אין client store ליישב.
- **גיאולוקציה:** נלכדת ברכיב client, נשמרת דרך `updateProfile`;
  ה*שרת* הוא מקור-האמת לקואורדינטות (ערך הדפדפן נזרק לאחר השמירה).
- **סשן:** cookies של `@supabase/ssr`; middleware מרענן; רכיבים לעולם אינם
  מחזיקים מצב auth — הם קוראים אותו לכל בקשה.

מה שאינו קיים: global stores, שליפת נתונים בצד-לקוח (אין SWR/React
Query), עדכונים אופטימיים (כל mutation נעקב על ידי אמת שרוּנדרה-בשרת
— בהשהיית MVP זה פשוט יותר ותמיד עקבי).

---

## 9. אימות קלט (Input Validation)

סכימת zod אחת לכל טופס ב-`lib/validation/`, מנותחת סמכותית ב-
Server Action; בצד-לקוח, מאפייני constraint-validation נייטיביים של HTML משקפים
את אותם גבולות למשוב מיידי. אילוצי DB (§1.2) הם קו ההגנה האחרון:

| סכימה | חוקים (בבואה של אילוצי DB) |
|---|---|
| `signUpSchema` | פורמט email; סיסמה ≥ 8 תווים |
| `profileSchema` | display_name 1–40; טלפון `^0\d{8,9}$` (אופציונלי עד לאימות); טווחי lat/lng, שניהם-או-אף-אחד |
| `identityApplicationSchema` | full_name 2–60; self_description ≤ 500; טלפון נדרש כאן (`^0\d{8,9}$` — משוקף על ידי ה-CHECK `identity_requires_phone`); doc_path אופציונלי |
| `professionalApplicationSchema` | doc_path נדרש (משוקף על ידי ה-CHECK `professional_requires_doc`) |
| `requestSchema` | title 3–80; description 10–2000; category ∈ רשימה קבועה; lat/lng נדרשים (עמודות NOT NULL); נתיבי תמונה 0–5 (אופציונלי) |
| `offerSchema` | message 5–1000; pricingMode ∈ {fixed, volunteer, after_job}; price נדרש רק אם mode=fixed (0 < price ≤ 99999.99) |
| `finalPriceSchema` | 0 < price ≤ 99999.99 — הסכום הסופי של after_job הנקבע לאחר-השלמה על ידי העוזר הנבחר |
| `ratingSchema` | stars int 1–5; note ≤ 500 |
| `reviewSchema` (מנהל) | note נדרש בדחייה, ≤ 500 |

העלאות קבצים מאומתות בצד-לקוח (type ∈ jpeg/png/webp, גודל ≤ 5 MB, מספר ≤ 5)
ומתוחמות-מחדש על ידי הגדרת הבאקט בצד-שרת.

---

## 10. טיפול בשגיאות (Error Handling)

ארבע מחלקות כשל, לכל אחת חוק טיפול אחד (פרטים: ארכיטקטורה §10):

1. **אימות (Validation)** → issues של zod ממופים ל-`fieldErrors`; מוצגים inline בעברית.
2. **עסקי/הרשאה** → קודי RPC וסירובי RLS ממופים דרך טבלת §5 להודעה
   ידידותית אחת; שורות בלתי-נראות-ל-RLS מציגות `not-found.tsx`
   (בלתי-ניתנות-להבחנה מחסרות-באמת — ללא דליפת קיום).
3. **תשתית (Infrastructure)** (Supabase בלתי-נגיש, כשל אחסון) → `formError`
   "משהו השתבש, נסו שוב"; מתועד בצד-שרת עם `console.error` (לוגים של Vercel).
4. **שגיאות רינדור** → גבולות `error.tsx` של route-group עם כפתור reset.

סמנטיקת כשל של זרימת ההעלאה: תמונות מועלות תחילה; אם הפעולה העוקבת
נכשלת, אובייקטים יתומים עשויים להישאר (בלתי-נראים, חסומים, ניקוי במסמך קנה-המידה) —
אך שורת בקשה ללא תמונות לעולם אינה יכולה להתקיים (RPC).

---

## 11. עיצוב UX (החוויה המרכזית)

- **הפיד הוא פני המוצר:** כרטיס = תמונה ממוזערת, כותרת, צ'יפ קטגוריה,
  צ'יפ מרחק, לפני-כמה-זמן. הקשה אחת לפירוט. מסננים כצ'יפים, לא
  תפריטים. RTL, תאריכי locale של `he`.
- **פירוט הבקשה מסתגל לצופה** (אותו URL, פאנלים תלויי-תפקיד):
  הבעלים רואה הצעות + כפתורי הקצאה; עוזר מאומת רואה את טופס ההצעה (או
  את ההצעה הקיימת שלו + עריכה/משיכה); הזוג המוקצה רואה את כרטיס הקשר
  + פאנל השלמה עם מצב מפורש של "ממתין לצד השני"; לאחר-השלמה
  הבעלים רואה את טופס הדירוג.
- **אימות הוא משפך, לא חומה:** משתמשים לא-מאומתים מעיינים בחופשיות; ה-
  gate מופיע בדיוק בשתי נקודות הפעולה (פרסום / הצעה) כהפניה ל-
  `/verification` עם הסבר בשורה אחת; מצב pending תמיד נראה
  שם ("הבקשה בבדיקה").
- **סימני אמון בכל מקום שעוזר מופיע:** תג (מאומת / בעל מקצוע)
  וממוצע כוכבים מוצגים בכל כרטיס הצעה וקישור פרופיל.
- **מצבים ריקים מלמדים:** פיד ריק → "פרסמו את הבקשה הראשונה"; אין הצעות עדיין →
  מה קורה הלאה; השלמה לא-מדורגת → דחיפה לדרג.
- **טעינה:** שלדי (skeletons) `loading.tsx` ברמת-מסלול לפיד ולפירוט; כפתורי
  טופס מציגים ספינרים של pending דרך `useFormStatus`.
- **יסודות נגישות:** כותרות סמנטיות, קלטים מתויגים, focus-visible,
  `dir="rtl"` בשורש עם ריווח logical-property לכל אורך הדרך.

---

## 12. מבנה תיקיות (מוכן-למימוש)

```
app/
  (public)/
    login/page.tsx  signup/page.tsx  emergency/page.tsx  page.tsx
  (app)/
    layout.tsx                      # session read, nav
    error.tsx  not-found.tsx        # route-group boundaries (§10)
    profile/page.tsx                # onboarding target — outside (onboarded)
                                    # to avoid a redirect loop
    (onboarded)/                    # onboarding gate group (redirects empty
      layout.tsx                    # display name → /profile)
      requests/page.tsx             # feed
      requests/loading.tsx          # skeletons (§11)
      requests/new/page.tsx
      requests/[id]/page.tsx
      requests/[id]/loading.tsx
      my/requests/page.tsx  my/offers/page.tsx
      helpers/[id]/page.tsx
      verification/page.tsx
      admin/page.tsx                # inside the shell: shares nav/session/error
                                    # boundary; RLS + in-page is_admin gate 404s
                                    # non-admins
  layout.tsx                        # <html dir="rtl" lang="he"> only
actions/
  auth.ts  profile.ts  verification.ts  requests.ts  offers.ts  ratings.ts
  admin.ts  helpers.ts
components/                         # §7 table
lib/
  supabase/{server,client,middleware}.ts
  geo.ts  strings.ts  categories.ts  errors.ts   # RPC-code → Hebrew mapping
  leaflet-icon.ts                   # Leaflet marker-icon asset wiring
  validation/{auth,profile,verification,request,offer,rating}.ts
supabase/
  migrations/
    0001_enums.sql  0002_tables.sql  0003_indexes.sql
    0004_functions.sql  0005_triggers.sql  0006_policies.sql
    0007_storage.sql  0008_grants.sql  0009_offer_pricing.sql
    0010_offer_pricing_mode.sql  0011_drop_payment_type.sql
    0012_avatars.sql  0013_pin_final_price_insert.sql
scripts/
  seed.ts                           # demo data — see below
proxy.ts                            # session refresh (Next 16 name for root
                                    # middleware); matcher excludes /emergency
```

**זריעה (נתוני demo/dev):** משתמשי auth אינם ניתנים ליצירה אמינה על ידי SQL רגיל
(סכימת `auth` בבעלות GoTrue והפנימיות שלה לא-מגורסות), ולכן
`scripts/seed.ts` משתמש ב-**admin API של service-role באופן מקומי בלבד** — בדיוק
פטור "כלים מקומיים למיגרציות/זריעה" של ארכיטקטורה §9 — כדי ליצור
משתמשים, ואז מכניס שורות תחום. מערך ה-demo שהמצגת צריכה:
מנהל 1, 4 משתמשים מאומתי-זהות (1 עם תג המקצוענות),
משתמש לא-מאומת 1 (להדגמת ה-gate), בקשות ב**כל** מצב מחזור-חיים
(open, has_offers, assigned, completed, rated, cancelled, ועוד אחת מוסתרת),
הצעות בכל סטטוס, וכמה דירוגים כדי שהממוצעים יוצגו.

---

## 13. נקודות פתוחות שנדחו במכוון

| נקודה | היכן היא נוחתת |
|---|---|
| ניקוי אובייקטי אחסון יתומים | מסמך קנה-מידה (סריקה ידנית/cron) |
| דנורמליזציה של אגרגט דירוגים | מסמך קנה-מידה (כשדפי הפרופיל מתחממים) |
| מרחק בצד-DB + keyset pagination | מסמך קנה-מידה (כשמגבלת ה-200 מתגלה) |
| אימות טלפון ב-SMS, מגבלות שמירת תעודות-זהות | מפת-דרכים של מסמך האבטחה |
| אישור email בהרשמה | פריט מפת-דרכים של מתג-אחד (ארכיטקטורה §8.4) |
