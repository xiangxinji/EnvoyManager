import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateSession, __clearSessions, __seedSession } from "../../routes/admin.js";

beforeEach(() => {
  vi.useRealTimers();
  __clearSessions();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Admin session: validateSession", () => {
  it("returns false for unknown token", () => {
    expect(validateSession("nonexistent-token")).toBe(false);
  });

  it("returns true for valid session", () => {
    const token = __seedSession();
    expect(validateSession(token)).toBe(true);
  });

  it("returns false for expired session (>24h)", () => {
    const token = __seedSession(Date.now() - 25 * 60 * 60 * 1000);
    expect(validateSession(token)).toBe(false);
  });

  it("returns true for session just under TTL (<24h)", () => {
    const token = __seedSession(Date.now() - 23 * 60 * 60 * 1000);
    expect(validateSession(token)).toBe(true);
  });

  it("refreshes a valid session so active admins are not logged out mid-use", () => {
    const start = new Date("2026-06-06T00:00:00.000Z");
    vi.setSystemTime(start);
    const token = __seedSession(Date.now() - 23 * 60 * 60 * 1000);

    expect(validateSession(token)).toBe(true);

    vi.setSystemTime(new Date(start.getTime() + 2 * 60 * 60 * 1000));
    expect(validateSession(token)).toBe(true);
  });

  it("deletes expired token from the sessions Map", () => {
    const token = __seedSession(Date.now() - 25 * 60 * 60 * 1000);
    expect(validateSession(token)).toBe(false);
    // Second call should also return false — token was deleted on first call
    expect(validateSession(token)).toBe(false);
  });

  it("__clearSessions empties all sessions", () => {
    const t1 = __seedSession();
    const t2 = __seedSession();
    const t3 = __seedSession();
    __clearSessions();
    expect(validateSession(t1)).toBe(false);
    expect(validateSession(t2)).toBe(false);
    expect(validateSession(t3)).toBe(false);
  });
});
