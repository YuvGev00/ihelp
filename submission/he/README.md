# iHelp — מבקשים עזרה, העוזרים מגיעים אליכם

פרויקט גמר עבור **טכנולוגיות אינטרנט — הפיכה למהנדס Full-Stack** (מדעי המחשב, אוניברסיטת רייכמן 2026).

**🌐 אפליקציה חיה:** https://ihelp-roan.vercel.app · **מאגר קוד:** https://github.com/YuvGev00/ihelp

iHelp הופך את מודל חיפוש העזרה: מבקש מפרסם בקשת עזרה, ועוזרים מאומתי-זהות בסביבה מתחרים על הצעת עזרה — בתשלום או בהתנדבות. שני צדי כל עסקה עוברים אימות זהות בבדיקת מנהל, והעוזרים מדורגים לאחר סיום המשימה.

**מחסנית טכנולוגית:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + RLS, Auth, Storage) · Tailwind v4 · Vercel · Leaflet + OpenStreetMap (מפות לתצוגה בלבד, ללא מפתח API)

## תיעוד

> **חדשים כאן? התחילו מ-[`SUBMISSION-INDEX.md`](SUBMISSION-INDEX.md)** — הוא ממפה את
> 10 פריטי ההגשה הנדרשים לקבצים שלהם, ומפרט את חשבונות ההדגמה.

תיקיית הגשה זו מכילה את המסמכים הנדרשים (ב-`en/` וב-`he/`):

| מסמך | תוכן |
|---|---|
| [`product-spec.md`](product-spec.md) | מפרט מוצר — בעיה, משתמשים, לקוח, יעדים, תהליכים, מכונת מצבים, מטריצת הרשאות |
| [`technical-design.md`](technical-design.md) | תכנון טכני — סכמת SQL מלאה, כל מדיניות RLS, גופי RPC, CRUD, ולידציה, טיפול בשגיאות, UX |
| [`testing-spec.md`](testing-spec.md) | מפרט בדיקות — מה נבדק ולמה זה מוכיח שהמוצר עובד |
| [`scale.md`](scale.md) | קנה מידה — ניתוח עומסים, אינדקסים, עימוד, מגבלות ופתרונות המשך |
| [`security.md`](security.md) | אבטחה — שכבות אימות/הרשאה, סודות, משתני סביבה, סיכונים שנותרו |
| [`presentation.md`](presentation.md) | דף הרצה למצגת — טקסט דיבור + תסריט הדגמה |
| [`easy-review.md`](easy-review.md) | מדריך בדיקה קלה — מה נבנה + מסלול בדיקה של 5 דקות |

מסמכי העמקה נוספים (ארכיטקטורה, מדריך פנימי, מדריך צעד-אחר-צעד, אסמכתת קבצים,
מפת מושגי הקורס) נמצאים ב**תיקיית `docs/` במאגר ה-GitHub**:
https://github.com/YuvGev00/ihelp/tree/main/docs

## הרצה מקומית

דרישות מוקדמות: Node.js ≥ 20, Docker (עבור Supabase מקומי), Supabase CLI (בשימוש דרך `npx`).

```bash
# 1. Install dependencies
npm install

# 2. Start a local Supabase stack (applies supabase/migrations automatically)
npx supabase start
#    → prints API URL, anon key, and service_role key

# 3. Configure environment
cp .env.local.example .env.local
#    fill NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY from step 2

# 4. (Optional) seed demo data — requires the service_role key from step 2
SUPABASE_SERVICE_ROLE_KEY=... SEED_PASSWORD=... npx tsx scripts/seed.ts

# 5. Run
npm run dev        # http://localhost:3000
```

פקודות נוספות: `npm test` (בדיקות יחידה), `npm run lint`, `npm run build`.

## משתני סביבה

האפליקציה המופצת זקוקה **לשניים בדיוק**, ושניהם בטוחים לחשיפה משום ש-Row Level Security הוא הסמכות (ראו `docs/architecture.md` §9):

| משתנה | מטרה |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת ה-URL של פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח anon ציבורי — אינו מעניק דבר מעבר למה ש-RLS מתיר |

`SUPABASE_SERVICE_ROLE_KEY` נמצא בשימוש **אך ורק** על ידי סקריפט ה-seed המקומי — לעולם אל תגדירו אותו ב-Vercel; שום קוד אפליקציה אינו קורא אותו.

## מודל האבטחה בפסקה אחת

כל הרשאה נאכפת במסד הנתונים: מדיניות RLS לגישה לשורות, אילוצי unique/check לכללים בין-שורתיים, ומערך קטן ומבוקר של פונקציות SECURITY DEFINER (אחת-עשרה RPCs) עבור מעברי מצב אטומיים — ה-UI ופעולות השרת רק משקפים כללים אלו לנוחות השימוש. בקשת API מזויפת הנושאת JWT של משתמש נתקלת בדיוק באותו קיר. פרטים: `docs/technical-design.md` §2–§3.
