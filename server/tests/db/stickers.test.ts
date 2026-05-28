import { describe, it, expect, beforeEach } from "vitest";
import { createTeamDB } from "../helpers/team-db.js";
import {
  __setTeamDb,
  insertSticker,
  listStickersByUser,
  getStickerById,
  deleteSticker,
  collectSticker,
} from "../../db.js";

const TEAM = "test-team";

function init() {
  const db = createTeamDB();
  __setTeamDb(TEAM, db);
  return db;
}

describe("Sticker CRUD", () => {
  beforeEach(() => {
    init();
  });

  const sampleSticker = {
    user_id: "alice",
    name: "happy",
    filename: "happy.png",
    size: 1024,
    mime_type: "image/png",
    file_hash: "abc123",
  };

  it("insertSticker creates a record", () => {
    const s = insertSticker(TEAM, sampleSticker);
    expect(s.id).toBeDefined();
    expect(s.name).toBe("happy");
    expect(s.created_at).toBeTypeOf("number");
  });

  it("listStickersByUser returns user stickers", () => {
    insertSticker(TEAM, { ...sampleSticker, name: "s1" });
    insertSticker(TEAM, { ...sampleSticker, name: "s2", user_id: "bob", file_hash: "def456" });
    const stickers = listStickersByUser(TEAM, "alice");
    expect(stickers).toHaveLength(1);
    expect(stickers[0].name).toBe("s1");
  });

  it("getStickerById returns sticker", () => {
    const created = insertSticker(TEAM, sampleSticker);
    const found = getStickerById(TEAM, created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("happy");
  });

  it("getStickerById returns null for unknown", () => {
    expect(getStickerById(TEAM, "ghost")).toBeNull();
  });

  it("deleteSticker removes sticker", () => {
    const s = insertSticker(TEAM, sampleSticker);
    expect(deleteSticker(TEAM, s.id)).toBe(true);
    expect(getStickerById(TEAM, s.id)).toBeNull();
  });

  it("deleteSticker returns false for unknown", () => {
    expect(deleteSticker(TEAM, "ghost")).toBe(false);
  });

  describe("collectSticker", () => {
    it("collects another user's sticker", () => {
      const original = insertSticker(TEAM, { ...sampleSticker, user_id: "alice" });
      const result = collectSticker(TEAM, original.id, "bob");
      if (!result.ok) throw new Error("expected ok");
      expect(result.sticker.user_id).toBe("bob");
      expect(result.sticker.name).toBe("happy");
      expect(result.sticker.file_hash).toBe("abc123");
    });

    it("rejects collecting own sticker", () => {
      const s = insertSticker(TEAM, { ...sampleSticker, user_id: "alice" });
      const result = collectSticker(TEAM, s.id, "alice");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("own_sticker");
    });

    it("rejects collecting non-existent sticker", () => {
      const result = collectSticker(TEAM, "ghost", "bob");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("not_found");
    });

    it("rejects duplicate collection", () => {
      const original = insertSticker(TEAM, { ...sampleSticker, user_id: "alice" });
      collectSticker(TEAM, original.id, "bob");
      const result = collectSticker(TEAM, original.id, "bob");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("already_collected");
    });
  });
});
