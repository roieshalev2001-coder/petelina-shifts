import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productionBaseUrl, resolveBaseUrl } from "./site-url";

const PROD = {
  VERCEL_ENV: "production",
  VERCEL_PROJECT_PRODUCTION_URL: "shifts-demo.vercel.app",
};

describe("הכתובת שנכנסת להודעות לעובדים", () => {
  it("בייצור — תמיד הכתובת הראשית, גם כשהמנהל גולש בכתובת של פריסה מסוימת", () => {
    assert.equal(
      resolveBaseUrl("shifts-a1b2c3d4-team-projects.vercel.app", PROD),
      "https://shifts-demo.vercel.app",
    );
  });

  it("כשיחובר דומיין פרטי, Vercel מחזיר אותו — וההודעות עוברות אליו בלי שינוי קוד", () => {
    assert.equal(
      resolveBaseUrl("shifts-demo.vercel.app", {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "shifts.petelina.co.il",
      }),
      "https://shifts.petelina.co.il",
    );
  });

  it("פיתוח מקומי — הכתובת שבבקשה, ב-http", () => {
    assert.equal(resolveBaseUrl("localhost:3200", {}), "http://localhost:3200");
  });

  it("פריסת תצוגה מקדימה אינה מפנה לייצור", () => {
    assert.equal(
      resolveBaseUrl("shifts-git-x.vercel.app", {
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "shifts-demo.vercel.app",
      }),
      "https://shifts-git-x.vercel.app",
    );
  });

  it("ייצור בלי המשתנה — חוזר לכתובת שבבקשה ולא מייצר קישור שבור", () => {
    assert.equal(productionBaseUrl({ VERCEL_ENV: "production" }), null);
    assert.equal(
      resolveBaseUrl("shifts-demo.vercel.app", { VERCEL_ENV: "production" }),
      "https://shifts-demo.vercel.app",
    );
  });

  it("בלי שום כתובת בבקשה — ברירת המחדל המקומית", () => {
    assert.equal(resolveBaseUrl(null, {}), "http://localhost:3000");
  });
});
