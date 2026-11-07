"use client";

import { useEffect, useState } from "react";
import { Button, Notice, ShareIcon } from "@/components/ui";

/**
 * הפעלת התראות לנייד.
 *
 * **באייפון זה עובד רק אחרי הוספה למסך הבית.** ספארי אינו מאפשר דחיפה
 * לאתר רגיל, וזו לא בעיה שאפשר לעקוף בקוד — לכן המסך אומר את זה במפורש
 * במקום להציג כפתור שלא יעשה כלום.
 *
 * מי שלא יעבור את המסלול הזה עדיין מקבל הכול בפעמון שבכותרת. ההתראה
 * בתוך האתר היא העיקר, והדחיפה היא השיפור.
 */

type State = "loading" | "unsupported" | "ios-needs-install" | "off" | "on" | "denied";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // ספארי באייפון מסמן את זה בדגל לא־תקני משלו
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * base64url → ArrayBuffer, כפי ש-PushManager מצפה למפתח.
 *
 * מוחזר ArrayBuffer ולא Uint8Array: הטיפוס של applicationServerKey דורש
 * מאגר רגיל, ו-Uint8Array גנרי עלול לשבת מעל SharedArrayBuffer.
 */
function decodeKey(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * הזיהוי כולו אסינכרוני, גם הענפים שיכלו להיות מיידיים.
   *
   * setState סינכרוני בתוך effect מפעיל רינדור נוסף מיד — ו-react-hooks
   * חוסם את זה בצדק. ה-cancelled מונע עדכון אחרי פירוק, למקרה שהעובד
   * ניווט הלאה בזמן שהדפדפן עוד בודק הרשמה קיימת.
   */
  useEffect(() => {
    let cancelled = false;

    async function detect(): Promise<State> {
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        return isIOS() && !isStandalone() ? "ios-needs-install" : "unsupported";
      }
      if (Notification.permission === "denied") return "denied";
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        return (await reg.pushManager.getSubscription()) ? "on" : "off";
      } catch {
        return "unsupported";
      }
    }

    detect().then((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey!),
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error();
      setState("on");
    } catch {
      setError("ההפעלה נכשלה. אפשר לנסות שוב, וההתראות באתר עובדות בכל מקרה.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  if (state === "ios-needs-install") {
    return (
      <Notice tone="neutral" title="להתראות באייפון">
        <p className="text-sm">
          שתף <ShareIcon /> ← <b>הוספה למסך הבית</b>, ואז לפתוח את פטלינה
          מהאייקון החדש. זו הדרך היחידה שאפל מאפשרת התראות לאתר.
        </p>
      </Notice>
    );
  }

  if (state === "unsupported") return null;

  if (state === "denied") {
    return (
      <Notice tone="neutral" title="ההתראות חסומות">
        <p className="text-sm">
          חסמת התראות לאתר הזה בדפדפן. אפשר להחזיר בהגדרות האתר בדפדפן —
          ובינתיים הכול מופיע כאן בפעמון.
        </p>
      </Notice>
    );
  }

  return (
    <div className="mb-3">
      {state === "on" ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={disable}>
          {busy ? "…" : "כיבוי התראות לנייד"}
        </Button>
      ) : (
        <Button variant="secondary" size="sm" disabled={busy} onClick={enable}>
          {busy ? "מפעיל…" : "הפעלת התראות לנייד"}
        </Button>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-amber-800">{error}</p>}
    </div>
  );
}
