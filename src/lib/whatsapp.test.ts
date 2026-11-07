import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePhone, whatsappShareUrl, whatsappUrl } from "./whatsapp";

describe("נרמול מספרי טלפון לוואטסאפ", () => {
  it("ממיר מספר ישראלי מקומי לפורמט בינלאומי", () => {
    assert.equal(normalizePhone("0501234567"), "972501234567");
    assert.equal(normalizePhone("050-123-4567"), "972501234567");
    assert.equal(normalizePhone("050 1234567"), "972501234567");
    assert.equal(normalizePhone("03-1234567"), "97231234567");
  });

  it("משאיר מספר שכבר בפורמט בינלאומי", () => {
    assert.equal(normalizePhone("972501234567"), "972501234567");
    assert.equal(normalizePhone("+972-50-123-4567"), "972501234567");
  });

  it("מחזיר null למספר לא תקין", () => {
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(""), null);
    assert.equal(normalizePhone("לא מספר"), null);
    assert.equal(normalizePhone("123"), null);
    assert.equal(normalizePhone("05012"), null);
  });

  it("בונה קישור wa.me עם הודעה מקודדת", () => {
    const url = whatsappUrl("050-1234567", "היי דנה");
    assert.ok(url?.startsWith("https://wa.me/972501234567?text="));
    assert.ok(url?.includes(encodeURIComponent("היי דנה")));
  });

  it("ללא טלפון אין קישור", () => {
    assert.equal(whatsappUrl(null, "הודעה"), null);
  });
});

describe("הודעה מוכנה בלי נמען — לקבוצה", () => {
  it("בלי מספר בקישור, כך שוואטסאפ שואל לאיזה צ'אט לשלוח", () => {
    const url = whatsappShareUrl("היי");
    assert.ok(url.startsWith("https://wa.me/?text="));
  });

  it("ההודעה כולה עוברת, כולל שורות חדשות ותווים מיוחדים", () => {
    const message = "חסרים מלצרים:\n\n• שני 13/10 · 07:15–13:00\nמי שיכול — שיכתוב & יגיד";
    const url = new URL(whatsappShareUrl(message));
    assert.equal(url.searchParams.get("text"), message);
  });
});
