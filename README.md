# תרגיל 12 - Paris Airbnb: מחברות את ה-Backend ל-SQL Server

קיבלתן Frontend מוכן שנראה כמו דף של Airbnb: כרטיסים של מקומות לינה בפריז, ותצוגת פרטים לכל מקום. ה-Frontend קורא ל-API של ה-Backend, אבל ל-Backend עדיין אין חיבור למסד הנתונים, ולכן הדף ריק.

**המשימה שלכן:** לחבר את שרת ה-Node.js/Express ל-SQL Server של הקורס, ולבנות Routers, Controllers ו-DAL כך שהלקוח יקבל את הנתונים הנכונים. כל השאילתות הן לקריאה בלבד (רק `GET`).

**מה מתרגלים:**
- חיבור Node.js ל-SQL Server עם החבילה `mssql` ו-connection pool.
- השכבות: Router ← Controller ← DAL ← Database.
- שאילתות עם `WHERE` ו-`ORDER BY`.
- הפונקציות מהשיעור, בתוך ה-SQL: Scalar Functions (`UPPER`, `LOWER`, `LEN`, `CEILING`, `FLOOR`, `ROUND`, `CONCAT`) ו-Conversion Functions (`CAST`, `STR`, `GETDATE`, `DATEADD`, `DATEDIFF`, `DAY`, `MONTH`, `YEAR`, `DATEPART`).

## איך זה צריך להיראות

🎬 **[צפו בסרטון הדגמה של האתר המוכן](https://cdn.jsdelivr.net/gh/Lior3796/sql-12-paris-airbnb@main/demo.mp4)** - כך האתר נראה כשה-Backend עובד.

## מה קיבלתן

```
client/                 ה-Frontend המוכן - לא משנים אותו
server/
  app.js                אפליקציית express (כאן מחברים את ה-routers)
  server.js             מפעיל את השרת (כאן בודקים את החיבור למסד)
  config/db.js          ה-connection pool              <- אתן כותבות
  routes/               ה-routers                       <- אתן כותבות
  controllers/          ה-controllers                   <- אתן כותבות
  dal/                  ה-DAL (כל ה-SQL)                <- אתן כותבות
  tests/                הטסטים - לא משנים
  .env.example          שמות המשתנים. את הערכים האמיתיים מקבלים בכיתה
docs/
  api-contract.md       ה-endpoints וה-JSON המדויק שהלקוח מצפה לו
  mssql-cheatsheet.md   דוגמה קצרה ל-pool ולשאילתה עם פרמטר
```

## איך מתחילים

1. לוחצות למעלה על **Use this template** ← **Create a new repository**, ויוצרות ריפו משלכן.
2. עושות `git clone` לריפו החדש ופותחות אותו ב-VS Code. צריך Node בגרסה 20 ומעלה (בודקות עם `node -v`).
3. מתקינות את השרת:
   ```bash
   cd server
   npm install
   ```
4. מעתיקות את `server/.env.example` לקובץ חדש `server/.env` וממלאות את הערכים שקיבלתן בכיתה. **אף פעם לא עושים commit ל-`.env`** (הוא כבר ב-`.gitignore`).
5. מריצות את השרת: `npm run dev` (בתוך `server`). השרת עולה על `http://localhost:3000`.
6. בטרמינל שני מריצות את הלקוח:
   ```bash
   cd client
   npm start
   ```
   ופותחות את `http://localhost:5173`. הלקוח מעביר כל בקשה ל-`/api/...` אל השרת שלכן על פורט 3000.

## איך בודקים

```bash
cd server
npm test
```

- בהתחלה כל הטסטים אדומים (✘). כל טסט מתחיל במספר השלב שהוא בודק.
- מתחת לכל טסט שנכשל כתוב מה לא עבד.
- הטסטים מתחברים לאותו מסד נתונים שב-`.env` ובודקים את התשובות של השרת שלכן מול הנתונים האמיתיים. הם רק קוראים - לא משנים כלום במסד.
- כשכל הטסטים ירוקים (✔) מופיעה ההודעה **✅ המשימה אושרה** ואפשר לעבור למשימה הבאה.
- טסטי הבונוס מסומנים בכוכב (☆ / ★). הם לא חובה, והמשימה מאושרת גם בלעדיהם.
- אחרי `git push` הטסטים רצים גם ב-GitHub (לשונית Actions) מול מסד נתונים לדוגמה עם חלק מהטבלה. וי ירוק ליד ה-commit = המשימה אושרה.

> אל תשנו את התיקייה `server/tests/` ואת התיקייה `client/`.

## הנתונים

טבלה: `dbo.Paris_Airbnb_listings` (59,320 שורות, בערך 80 עמודות). כל העמודות מאפשרות `NULL`.

| עמודות שתשתמשו בהן | הערות |
|---|---|
| `id`, `host_id` | מסוג `float`. משתמשות ב-`sql.Float` כשמעבירות אותם כפרמטרים. |
| `property_type`, `room_type`, `neighbourhood_cleansed`, `latitude`, `longitude` | טקסט ומספרים שמתארים את המקום. |
| `accommodates`, `bedrooms`, `beds`, `bathrooms` | מסוג `float`. עושות `CAST` ל-`INT` בשביל הלקוח. |
| `price` | מסוג `money` (מחיר ללילה, למשל `60.00`). |
| `review_scores_rating`, `number_of_reviews` | הדירוג הוא 0-100. הלקוח רוצה כוכבים מ-0 עד 5. |
| `host_name`, `host_since`, `host_is_superhost`, `host_about` | `host_since` שמור כמספר תאריך של Excel (למשל `39735` = 14.10.2008). `host_is_superhost` הוא `'t'` או `'f'`. |

טוב לדעת:
- אין עמודה של שם, תיאור או תמונה. ה-Backend בונה כותרת עם `CONCAT`, והלקוח מציג תמונה חלופית.
- חלק מהאותיות עם סימנים מופיעות משובשות בנתונים (למשל `Ã©`). זו בעיה ידועה בנתונים - לא מנסים לתקן אותה. כשמסננות לפי שכונה משתמשות בערכים שקיבלתן מה-API, לא מקלידות אותם ביד.
- המרה ממספר תאריך של Excel לתאריך אמיתי: `DATEADD(day, host_since - 2, '1900-01-01')`.

## הארכיטקטורה

| שכבה | אחריות | אסור |
|---|---|---|
| Router | מגדיר את הנתיב ומחבר אותו לפונקציה ב-controller. | לוגיקה או SQL. |
| Controller | קורא את `req.query` / `req.params`, בודק תקינות, קורא ל-DAL, קובע את קוד הסטטוס ושולח JSON. | SQL. |
| DAL | מריץ את ה-SQL דרך ה-pool ומחזיר את השורות. | שימוש ב-`req` או `res`. |

שמות הקבצים והפונקציות בתוך התיקיות - לבחירתכן (יש קבצים מוכנים עם הערות שאפשר להשתמש בהם). הטסטים בודקים את ההתנהגות דרך ה-API, ובודקים שה-SQL נמצא רק ב-`dal/` ושאין `req`/`res` ב-DAL.

## שלבים

### שלב 1: התחברות

1. מתקינות תלויות ב-`server/` וב-`client/`.
2. מעתיקות את `.env.example` ל-`.env` וממלאות את הערכים מהמרצה.
3. ב-`config/db.js` יוצרות **connection pool אחד** עם החבילה `mssql` ומייצאות אותו. משתמשות ב-pool קטן (`max: 3`) - כל הכיתה משתמשת באותו שרת.
4. ב-`server.js` בודקות את החיבור כשהשרת עולה, ומדפיסות הודעה ברורה של הצלחה (למשל `Connected to SQL Server`) או של שגיאה (למשל `Database connection failed: ...`).

רמז: ב-`docs/mssql-cheatsheet.md` יש דוגמה מלאה. הטסטים מוצאים את ה-pool גם אם ייצאתן `{ sql, poolPromise }`, גם `{ sql, pool, poolConnect }` וגם את ה-pool עצמו.

### שלב 2: Endpoint 1 - `GET /api/listings`

מחזיר את הכרטיסים. פרמטרים ב-query (כולם אופציונליים): `neighbourhood`, `roomType`, `minPrice`, `maxPrice`, `sort` (`price` או `rating`), `limit` (ברירת מחדל 20, מקסימום 50).

- **WHERE:** מוציאות שורות בלי מחיר, ומוסיפות תנאי לכל פילטר שנשלח.
- **ORDER BY:** לפי מחיר עולה או לפי דירוג יורד, לפי `sort` (ברירת המחדל: מחיר). שימו לב: שם עמודה ב-`ORDER BY` לא יכול להיות פרמטר. ממפות את הערכים המותרים ב-controller ודוחות כל ערך אחר עם `400`.
- **Limit:** עם `TOP`. `limit` שהוא לא מספר שלם חיובי ← `400`. `limit` גדול מ-50 ← משתמשות ב-50.
- `minPrice` / `maxPrice` שהם לא מספר (או שליליים) ← `400`.
- **פונקציות ב-SQL (לא ב-JavaScript):** `CONCAT` לכותרת, `UPPER` ל-`propertyType`, `CAST` ל-INT עבור price/bedrooms/beds/accommodates, `ROUND` לכוכבים (הדירוג חלקי 20, ספרה אחת אחרי הנקודה).

שמות השדות המדויקים ב-`docs/api-contract.md`. הם חייבים להתאים, כי הלקוח והטסטים תלויים בהם.

### שלב 3: Endpoint 2 - `GET /api/listings/:id`

מחזיר מקום אחד עם פרטי המארח. מחזירות `404` עם שגיאה ב-JSON אם ה-id לא קיים, ו-`400` אם ה-id הוא לא מספר.

- **WHERE:** לפי `id`.
- **פונקציות ב-SQL:** ממירות את `host_since` לתאריך אמיתי עם `DATEADD`, מחשבות `yearsHosting` עם `DATEDIFF` ו-`GETDATE`, ומחזירות את שנת ההצטרפות עם `YEAR`. משתמשות ב-`LEN` עבור `aboutLength`.
- `host_is_superhost`: ממירות `'t'` / `'f'` ל-`true` / `false` ב-Controller.
- מחזירות גם `hostId` - הלקוח משתמש בו כדי להציג את שאר המקומות של המארח.

### שלב 4: Endpoint 3 - `GET /api/hosts/:hostId/listings`

מחזיר את כל המקומות של מארח אחד, מהזול ליקר.

- **WHERE:** לפי `host_id` ו-`price` שאינו `NULL`.
- **ORDER BY:** מחיר עולה.
- **פונקציות ב-SQL:** `UPPER` לשם המארח, ואותם שדות כרטיס כמו ב-Endpoint 1.
- `hostId` שהוא לא מספר ← `400`. מארח בלי מקומות ← `404`.

### שלב 5: בדיקה

1. פותחות את הלקוח. כל כרטיס ותצוגת הפרטים צריכים להציג נתונים אמיתיים.
2. מנסות פילטרים ומיון בלקוח ובדפדפן, למשל:
   `http://localhost:3000/api/listings?roomType=Entire%20home/apt&minPrice=50&maxPrice=120&sort=price`
3. מריצות `npm test` בתוך `server/`.

## כללים

- רק בקשות `GET`. לא כותבות, לא מעדכנות ולא מוחקות שום דבר במסד.
- אין SQL מחוץ ל-DAL. אין `req` או `res` בתוך ה-DAL.
- תמיד משתמשות בפרמטרים לערכים (`.input()`). אף פעם לא בונות SQL מהדבקה של טקסט מהמשתמש.
- לא משתמשות ב-`SELECT *`. בוחרות רק את העמודות שצריך (`host_about` גדולה מאוד).
- עושות את העיצוב של הנתונים עם פונקציות SQL, לא ב-JavaScript, איפה שהמשימה אומרת.
- לא משנות את `client/` ואת `server/tests/`. לא עושות commit ל-`.env`.
- כל שגיאה חוזרת כ-JSON: `{ "error": "..." }`. שגיאה של מסד הנתונים ← `500` (עם `try/catch` ב-controller).

## בונוס

- מפרקות את העמודה `amenities` (טקסט כמו `{Wifi,Kitchen,"Hair dryer"}`) למערך ב-controller ומחזירות אותו ב-endpoint של הפרטים.
- מוסיפות פילטר `minRating` (בכוכבים, 0-5) ל-`GET /api/listings`.
- מחזירות את אחוז התגובה של המארח כטקסט עם `STR` (למשל `"100%"`) בשדה `hostResponseRate`.

## בדיקה עצמית

- 3 ה-endpoints מחזירים את הנתונים והמבנה מהחוזה (`docs/api-contract.md`).
- פילטרים, limit ומיון עובדים. קלט לא תקין מחזיר `400`, id שלא קיים מחזיר `404`, ושגיאת שרת מחזירה `500` - הכל כ-JSON.
- דף הלקוח מציג נתונים אמיתיים.
- מבנה התיקיות: `routes/`, `controllers/`, `dal/`, `config/`.
- כל הטסטים עוברים.

## הגשה

עושות push לריפו שלכן ב-GitHub ומגישות את הקישור ב-Google Classroom. מוסיפות README קצר עם הוראות הרצה.
