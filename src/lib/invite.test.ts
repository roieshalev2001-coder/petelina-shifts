import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INVITE_DAYS, hashInviteToken, newInvite, openInviteUntil } from "./invite-token";

describe("קישור כניסה", () => {
  const now = new Date("2026-10-25T10:00:00.000Z");

  it("תקף 7 ימים, ובמסד נשמר רק הגיבוב", () => {
    const invite = newInvite(now);
    assert.equal(invite.expiresAt.getTime() - now.getTime(), INVITE_DAYS * 86_400_000);
    assert.equal(invite.hash, hashInviteToken(invite.token));
    assert.notEqual(invite.hash, invite.token);
  });

  it("כל קישור אחר — אי אפשר לנחש", () => {
    assert.notEqual(newInvite(now).token, newInvite(now).token);
    assert.ok(newInvite(now).token.length >= 32);
  });

  it("קישור שפג לא מוצג כפתוח", () => {
    assert.equal(openInviteUntil(null, now), null);
    assert.equal(openInviteUntil(new Date(now.getTime() - 1), now), null);
    const later = new Date(now.getTime() + 1000);
    assert.equal(openInviteUntil(later, now), later);
  });
});
