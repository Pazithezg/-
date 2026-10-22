import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "../lib/session";
import { hashPassword, verifyPassword } from "../lib/passwords";

const secret = "test-only-signing-secret-over-32-characters";
const now = Date.UTC(2026, 9, 18);
const user = { userId: "casebook-user", email: "contributor@example.test", role: "USER" as const };

test("session signing preserves identity and expires after eight hours", async () => {
  const token = await createSessionToken(user, { secret, now });
  assert.deepEqual(await verifySessionToken(token, { secret, now }), { ...user, expiresAt: now / 1000 + SESSION_MAX_AGE_SECONDS });
  assert.equal(await verifySessionToken(token, { secret, now: now + SESSION_MAX_AGE_SECONDS * 1000 }), null);
});

test("changing the signed role does not grant administrator access", async () => {
  const token = await createSessionToken(user, { secret, now });
  const [body, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  payload.role = "ADMIN";
  const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
  assert.equal(await verifySessionToken(forged, { secret, now }), null);
  assert.equal(await verifySessionToken("true", { secret, now }), null);
});

test("sessions signed with another key and malformed tokens are rejected", async () => {
  const token = await createSessionToken(user, { secret, now });
  assert.equal(await verifySessionToken(token, { secret: "another-test-signing-secret", now }), null);
  assert.equal(await verifySessionToken(`${token}.extra`, { secret, now }), null);
  assert.equal(await verifySessionToken(undefined, { secret, now }), null);
});

test("passwords use independent salts and reject wrong passwords and legacy accounts", async () => {
  const password = "a test password at least 12 characters";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, "malformed:hash"), false);
  await assert.rejects(hashPassword("too-short"));
});
