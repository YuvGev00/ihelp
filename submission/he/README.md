# iHelp — מבקשים עזרה, העוזרים מגיעים אליכם

פרויקט גמר עבור **טכנולוגיות אינטרנט — הפיכה למהנדס Full-Stack** (מדעי המחשב, אוניברסיטת רייכמן 2026).

**🌐 אפליקציה חיה:** https://ihelp-roan.vercel.app · **מאגר קוד:** https://github.com/YuvGev00/ihelp

iHelp הופך את מודל חיפוש העזרה: מבקש מפרסם בקשת עזרה, ועוזרים מאומתי-זהות בסביבה מתחרים על הצעת עזרה — בתשלום או בהתנדבות. שני צדי כל עסקה עוברים אימות זהות בבדיקת מנהל, והעוזרים מדורגים לאחר סיום המשימה.

**מחסנית טכנולוגית:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + RLS, Auth, Storage) · Tailwind v4 · Vercel · Leaflet + OpenStreetMap (מפות לתצוגה בלבד, ללא מפתח API)

## תיעוד

| מסמך | תוכן |
|---|---|
| [docs/01-product-spec.md](docs/01-product-spec.md) | מפרט מוצר — בעיה, משתמשים, לקוח, יעדים, תהליכים, מכונת מצבים, מטריצת הרשאות |
| [docs/02-architecture.md](docs/02-architecture.md) | ארכיטקטורה — רכיבים, בחירות טכנולוגיות, זרימות נתונים, שכבות אכיפה |
| [docs/03-technical-design.md](docs/03-technical-design.md) | תכנון טכני — סכמת SQL מלאה, כל מדיניות RLS, גופי RPC, CRUD, ולידציה, טיפול בשגיאות, UX |
| [docs/04-testing-spec.md](docs/04-testing-spec.md) | מפרט בדיקות — מה נבדק ולמה זה מוכיח שהמוצר עובד |
| [docs/05-scale.md](docs/05-scale.md) | קנה מידה — ניתוח עומסים, אינדקסים, עימוד, מגבלות ופתרונות המשך |
| [docs/06-security.md](docs/06-security.md) | אבטחה — שכבות אימות/הרשאה, סודות, משתני סביבה, סיכונים שנותרו |
| [docs/07-internal-architecture.md](docs/07-internal-architecture.md) | מדריך פנימי — סיור במאגר הקוד, זרימות, אינדקס החלטות (הכנה למצגת) |
| [docs/08-presentation.md](docs/08-presentation.md) | תוכנית מצגת — מתווה של 10–15 דקות + תסריט הדגמה |
| [docs/09-project-walkthrough.md](docs/09-project-walkthrough.md) | מדריך צעד-אחר-צעד — התקנה, בדיקות "האם זה עובד?", כניסות להדגמה, זרימה מרכזית |
| [docs/10-file-reference.md](docs/10-file-reference.md) | אסמכתה קובץ-אחר-קובץ — מטרתו ומימושו של כל קובץ מקור |
| [docs/11-course-concepts-map.md](docs/11-course-concepts-map.md) | מפת מושגי הקורס — כל מושג שנלמד ← כיצד/מדוע/היכן בקוד |

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

האפליקציה המופצת זקוקה **לשניים בדיוק**, ושניהם בטוחים לחשיפה משום ש-Row Level Security הוא הסמכות (ראו `docs/02-architecture.md` §9):

| משתנה | מטרה |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת ה-URL של פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח anon ציבורי — אינו מעניק דבר מעבר למה ש-RLS מתיר |

`SUPABASE_SERVICE_ROLE_KEY` נמצא בשימוש **אך ורק** על ידי סקריפט ה-seed המקומי — לעולם אל תגדירו אותו ב-Vercel; שום קוד אפליקציה אינו קורא אותו.

## מודל האבטחה בפסקה אחת

כל הרשאה נאכפת במסד הנתונים: מדיניות RLS לגישה לשורות, אילוצי unique/check לכללים בין-שורתיים, ומערך קטן ומבוקר של פונקציות SECURITY DEFINER (אחת-עשרה RPCs) עבור מעברי מצב אטומיים — ה-UI ופעולות השרת רק משקפים כללים אלו לנוחות השימוש. בקשת API מזויפת הנושאת JWT של משתמש נתקלת בדיוק באותו קיר. פרטים: `docs/03-technical-design.md` §2–§3.
