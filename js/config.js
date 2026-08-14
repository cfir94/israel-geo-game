/* =============================================================
   הגדרת החשבונות והסנכרון.

   כל עוד שני השדות ריקים, המשחק עובד בדיוק כמו קודם:
   התקדמות נשמרת מקומית במכשיר, בלי חשבון ובלי שרת.

   כדי להפעיל חשבונות ומעקב התקדמות – ראו את ההוראות
   ב-README תחת "חשבונות וסנכרון", והדביקו כאן את שני
   הערכים מ-Supabase → Project Settings → API.

   ה-anon key מיועד להיות גלוי בצד הלקוח: הוא לבדו לא מאפשר
   גישה לנתונים. ההגנה היא ה-Row Level Security שב-schema.sql,
   שמתירה לכל משתמש לקרוא ולכתוב אך ורק את השורה שלו.
   ============================================================= */

const CLOUD = {
    url: "https://dendxtbaxiszohjjsdtd.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbmR4dGJheGlzem9oampzZHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTMzMTcsImV4cCI6MjEwMjI2OTMxN30.rDYzH-3Pz2-XOYoUgrJW7GfTvdrZ7usqbSdtTZ4my6g",
};
