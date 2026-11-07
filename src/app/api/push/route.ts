import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * הרשמה וביטול הרשמה לדחיפה.
 *
 * הזהות נקראת מהסשן ולא מהגוף של הבקשה — אחרת כל אחד היה יכול לרשום
 * מכשיר על שם עובד אחר ולקבל את ההתראות שלו.
 */

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return new Response("unauthorized", { status: 401 });

  let body: SubscriptionBody;
  try {
    body = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    typeof auth !== "string"
  ) {
    return new Response("bad request", { status: 400 });
  }

  /*
   * upsert לפי endpoint, שהוא ייחודי: אותו דפדפן מחזיר את אותה כתובת
   * בכל הרשמה חוזרת. בלי זה כל טעינת עמוד הייתה מוסיפה שורה, והעובד היה
   * מקבל את אותה התראה חמש פעמים.
   *
   * ה-employeeId מתעדכן גם בקיים — מכשיר משותף שעבר מיד ליד ישלח מעכשיו
   * למי שמחובר בו עכשיו.
   */
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { employeeId: me.id, endpoint, p256dh, auth },
    update: { employeeId: me.id, p256dh, auth },
  });

  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const me = await currentUser();
  if (!me) return new Response("unauthorized", { status: 401 });

  let endpoint: unknown;
  try {
    endpoint = (await request.json())?.endpoint;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (typeof endpoint !== "string") {
    return new Response("bad request", { status: 400 });
  }

  // deleteMany ולא delete: הרשמה שכבר נמחקה אינה שגיאה
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, employeeId: me.id },
  });
  return new Response(null, { status: 204 });
}
