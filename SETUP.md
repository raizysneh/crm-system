# הוראות התקנה - מערכת CRM

## שלב 1: הגדרת Supabase

1. היכנס לאתר [supabase.com](https://supabase.com) וצור חשבון חינמי
2. לחץ "New Project" וצור פרויקט חדש
3. שמור את ה-Project URL וה-anon key

## שלב 2: הגדרת מסד הנתונים

1. בפרויקט Supabase, עבור ל-**SQL Editor**
2. פתח את הקובץ `supabase/schema.sql` מהפרויקט
3. העתק את כל התוכן והדבק ב-SQL Editor
4. לחץ **Run** להרצה

## שלב 3: הגדרת משתנים סביבתיים

1. העתק את הקובץ `.env.local.example` לקובץ `.env.local`
2. מלא את הפרטים:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

הפרטים נמצאים ב-Supabase תחת **Settings > API**

## שלב 4: יצירת משתמש מנהל

1. בפרויקט Supabase, עבור ל-**Authentication > Users**
2. לחץ "Invite user" ורשום את המייל שלך
3. לאחר ההרשמה, עבור ל-**SQL Editor** והרץ:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

## שלב 5: הפעלת המערכת

```bash
# התקנת חבילות (כבר בוצע)
npm install

# הפעלת שרת פיתוח
npm run dev
```

פתח את הדפדפן על http://localhost:3000

## שלב 6: פרסום ל-Vercel (אופציונלי)

1. צור חשבון ב-[vercel.com](https://vercel.com)
2. חבר את תיקיית הפרויקט
3. הוסף את משתני הסביבה בהגדרות Vercel
4. הפרויקט יפורסם אוטומטית!

## מבנה המערכת

```
/login          - דף התחברות
/dashboard      - דשבורד ראשי
/clients        - ניהול לקוחות
/clients/[id]   - כרטיס לקוח
/projects       - ניהול פרויקטים
/projects/[id]  - כרטיס פרויקט
/tasks          - ניהול משימות (רשימה + קנבן)
/tasks/[id]     - כרטיס משימה עם תתי-משימות
/timers         - טיימרים ורשומות זמן
/attendance     - נוכחות
/reports        - דוחות + ייצוא CSV
/chat           - צ'אט פנימי
/settings       - הגדרות + ניהול משתמשים
```

## טכנולוגיות

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **UI**: Radix UI + shadcn-style components
- **State**: Zustand + React Query
