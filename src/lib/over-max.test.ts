import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { overMaxSlotIds, type OverMaxAssignment } from "./week";

function a(
  slotId: string,
  employeeId: string,
  opts: Partial<OverMaxAssignment> = {},
): OverMaxAssignment {
  return { slotId, employeeId, pinned: false, dayOfWeek: 0, sortOrder: 0, ...opts };
}

describe("אילו שיבוצים חורגים מהמקסימום", () => {
  it("מי שבתוך המקסימום אינו מסומן כלל", () => {
    const result = overMaxSlotIds(
      [a("s1", "e1", { dayOfWeek: 0 }), a("s2", "e1", { dayOfWeek: 1 })],
      new Map([["e1", 2]]),
    );
    assert.equal(result.size, 0);
  });

  it("מסמן את העודפים בלבד, מהסוף", () => {
    const result = overMaxSlotIds(
      [
        a("s1", "e1", { dayOfWeek: 0 }),
        a("s2", "e1", { dayOfWeek: 1 }),
        a("s3", "e1", { dayOfWeek: 2 }),
        a("s4", "e1", { dayOfWeek: 3 }),
      ],
      new Map([["e1", 2]]),
    );
    assert.deepEqual([...result].sort(), ["s3", "s4"]);
  });

  it("שיבוץ נעוץ לעולם אינו העודף — סבב שישי אינו ניתן להסרה מהלוח", () => {
    const result = overMaxSlotIds(
      [
        // שישי נעוץ, ולמרות שהוא האחרון בשבוע הוא ראשון בתור
        a("friday", "e1", { dayOfWeek: 5, pinned: true }),
        a("s1", "e1", { dayOfWeek: 0 }),
        a("s2", "e1", { dayOfWeek: 1 }),
      ],
      new Map([["e1", 1]]),
    );
    assert.deepEqual([...result].sort(), ["s1", "s2"]);
  });

  it("סופר כל עובד בנפרד", () => {
    const result = overMaxSlotIds(
      [
        a("s1", "e1", { dayOfWeek: 0 }),
        a("s2", "e1", { dayOfWeek: 1 }),
        a("s3", "e2", { dayOfWeek: 0 }),
      ],
      new Map([
        ["e1", 1],
        ["e2", 6],
      ]),
    );
    assert.deepEqual([...result], ["s2"]);
  });

  it("עובד שאינו במפה אינו מסומן — אין מקסימום ידוע", () => {
    const result = overMaxSlotIds(
      [a("s1", "ghost", { dayOfWeek: 0 }), a("s2", "ghost", { dayOfWeek: 1 })],
      new Map(),
    );
    assert.equal(result.size, 0);
  });

  it("מקסימום אפס מסמן את הכול", () => {
    const result = overMaxSlotIds([a("s1", "e1")], new Map([["e1", 0]]));
    assert.deepEqual([...result], ["s1"]);
  });

  it("אותו קלט מחזיר תמיד אותה תוצאה, ללא תלות בסדר הקלט", () => {
    const rows = [
      a("s3", "e1", { dayOfWeek: 2 }),
      a("s1", "e1", { dayOfWeek: 0 }),
      a("s2", "e1", { dayOfWeek: 1 }),
    ];
    const forward = overMaxSlotIds(rows, new Map([["e1", 1]]));
    const backward = overMaxSlotIds([...rows].reverse(), new Map([["e1", 1]]));
    assert.deepEqual([...forward].sort(), [...backward].sort());
  });
});
