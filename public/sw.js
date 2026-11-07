/*
 * Service worker לדחיפת התראות.
 *
 * שני אירועים בלבד:
 *
 *   push          — הודעה הגיעה מהשרת, מציגים אותה
 *   notificationclick — נלחצה, פותחים את המסך הרלוונטי
 *
 * אין כאן שמירה במטמון ואין עבודה במצב לא מקוון. זה מכוון: אפליקציה
 * שמגישה סידור ישן מהמטמון גרועה מאפליקציה שאומרת "אין חיבור", כי אי
 * אפשר להבחין ביניהן במבט.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "פטלינה", {
      body: payload.body ?? "",
      // אותו תג לכל ההתראות: הודעה חדשה מחליפה קודמת ולא מערימה עליה
      tag: "petelina",
      dir: "rtl",
      lang: "he",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url ?? "/me" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/me";

  /*
   * אם האתר כבר פתוח בטאב — מתמקדים בו ומנווטים, במקום לפתוח עוד אחד.
   * בלי זה כל התראה הייתה מייצרת טאב נוסף.
   */
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
