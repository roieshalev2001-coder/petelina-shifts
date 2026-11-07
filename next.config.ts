import type { NextConfig } from "next";

/**
 * בפיתוח, Next חוסם גישה למשאבים שלו מדומיין שאינו localhost. כשמריצים
 * מנהרה (cloudflared / ngrok) כדי לבדוק מהנייד, החסימה הזו שוברת את הדף:
 * ה-JS של הדפדפן לא נטען, וטפסים מפסיקים לעבוד בלי הודעת שגיאה ברורה.
 *
 * הרשימה כאן פותחת את הדומיינים של שירותי המנהרות בלבד, ורק בפיתוח.
 * להוספת דומיין נוסף: DEV_ORIGIN=my-host.example.com npm run dev
 */
const tunnelOrigins = [
  "*.trycloudflare.com",
  "*.ngrok-free.app",
  "*.ngrok.io",
  "*.loca.lt",
];

const nextConfig: NextConfig = {
  /*
   * אין `output: "standalone"`.
   *
   * הוא נדרש כשהאתר רץ על Prisma Compute, שהריץ את server.js של הפלט
   * העצמאי. Vercel בונה פלט משלו, ו-standalone רק היה מייצר עבודה כפולה.
   */

  /**
   * next/image משמש רק לפטל שבפס (src/components/Band.tsx), והוא מוגש כמו
   * שהוא — אין כאן מה לאופטם. ובכל זאת Next גורר את sharp אל
   * תוך הפלט — 27MB. `images.unoptimized` לבדו לא הספיק (נבדק), כי מעקב
   * הקבצים מושך אותו דרך שרת Next עצמו ולא דרך המסלולים.
   *
   * נשאר גם אחרי המעבר ל-Vercel: שם זה מקטין את גודל הפונקציה, וגודל
   * פונקציה הוא זמן התעוררות.
   */
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    "/*": ["./node_modules/@img/**/*", "./node_modules/sharp/**/*"],
  },

  /* מחוון הפיתוח יושב בפינה התחתונה ומכסה את סרגל הלשוניות בבדיקה */
  devIndicators: false,

  /*
   * בפיתוח Next מדפיס כל קריאה לפעולת שרת עם הארגומנטים שלה — כולל
   * טלפון וקוד אישי בכניסה ובהחלפת קוד, בטקסט גלוי ביומן השרת. זה קרה
   * בפועל כשנכנסו לעותק המקומי מהטלפון. בייצור זה לא מודפס בכל מקרה;
   * כאן זה כבוי כדי שקוד אמיתי לא יישאר ביומן של אף מחשב.
   */
  logging: { serverFunctions: false },

  allowedDevOrigins: [
    ...tunnelOrigins,
    ...(process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : []),
  ],
};

export default nextConfig;
