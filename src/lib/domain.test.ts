import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRoles, roleLabelsOf, submitRolesOf, traineeFor } from "./domain";

describe("מתלמדים בתפקידים", () => {
  it("parseRoles מתעלם ממתלמד — הבנייה ושישי לא רואים אותו", () => {
    assert.deepEqual(parseRoles("traineeWaiter"), []);
    assert.deepEqual(parseRoles("waiter,traineeBartender"), ["waiter"]);
  });

  it("מתלמד מגיש על הבלוקים של התפקיד שהוא לומד", () => {
    assert.deepEqual(traineeFor("traineeBartender"), ["bartender"]);
    assert.deepEqual(submitRolesOf("traineeWaiter"), ["waiter"]);
    assert.deepEqual(submitRolesOf("waiter,traineeBartender"), ["waiter", "bartender"]);
  });

  it("בלי כפילות כשהתפקיד והמתלמד אותו דבר", () => {
    assert.deepEqual(submitRolesOf("waiter,traineeWaiter"), ["waiter"]);
  });

  it("תוויות לתגיות", () => {
    assert.deepEqual(roleLabelsOf("waiter,traineeBartender"), ["מלצר", "מתלמד בר"]);
  });
});
