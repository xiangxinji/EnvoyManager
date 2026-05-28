import { describe, it, expect } from "vitest";
import { allocatePort } from "../team-registry.js";
import type { TeamRecord } from "../team-registry.js";

describe("allocatePort", () => {
  it("returns start port when no records exist", () => {
    expect(allocatePort([])).toBe(3001);
  });

  it("returns start port when no records exist with custom start", () => {
    expect(allocatePort([], 5000)).toBe(5000);
  });

  it("skips used ports", () => {
    const records: TeamRecord[] = [
      { name: "t1", port: 3001, createdAt: 1 },
      { name: "t2", port: 3002, createdAt: 2 },
    ];
    expect(allocatePort(records)).toBe(3003);
  });

  it("fills gaps in port sequence", () => {
    const records: TeamRecord[] = [
      { name: "t1", port: 3001, createdAt: 1 },
      { name: "t2", port: 3003, createdAt: 2 },
    ];
    expect(allocatePort(records)).toBe(3002);
  });

  it("handles custom start skipping used", () => {
    const records: TeamRecord[] = [
      { name: "t1", port: 5000, createdAt: 1 },
    ];
    expect(allocatePort(records, 5000)).toBe(5001);
  });
});
