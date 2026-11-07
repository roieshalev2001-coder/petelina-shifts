import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { personalShiftsText } from "./week";

const iso = (s: string) => `⁨${s}⁩`;

describe("\"המשמרות שלך השבוע\"", () => {
  const text = personalShiftsText({
    fullName: "דנה",
    weekLabel: "25/10–30/10",
    link: "https://example.test/login",
    shifts: [
      { dayOfWeek: 5, actualStart: "07:45", actualEnd: "15:00", role: "waiter" },
      { dayOfWeek: 0, actualStart: "07:15", actualEnd: "15:00", role: "waiter", note: "פותח קופה" },
      { dayOfWeek: 2, actualStart: "16:00", actualEnd: "CLOSING", role: "bartender", traineeWith: "עומר" },
      { dayOfWeek: 3, actualStart: "08:15", actualEnd: "15:00", role: "waiter", timeDisplay: "start" },
    ],
  });
  const lines = text.split("\n");

  it("פתיחה עם השם והשבוע, מבודד", () => {
    assert.equal(lines[0], `היי דנה, המשמרות שלך בשבוע ${iso("25/10–30/10")}:`);
  });

  it("שורה לכל משמרת, לפי הימים", () => {
    assert.deepEqual(lines.slice(2, 6), [
      `ראשון ${iso("07:15–15:00")} · מלצר · פותח קופה`,
      `שלישי ${iso("16:00–סגירה")} · מתלמד ברמן עם עומר`,
      `רביעי ${iso("08:15")} · מלצר`,
      // בשישי רק שעת ההגעה, כמו בסידור
      `שישי ${iso("07:45")} · מלצר`,
    ]);
  });

  it("נגמרת בקישור לסידור המלא", () => {
    assert.equal(lines.at(-1), "הסידור המלא באתר: https://example.test/login");
  });
});
