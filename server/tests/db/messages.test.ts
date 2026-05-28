import { describe, it, expect, beforeEach } from "vitest";
import { createTeamDB } from "../helpers/team-db.js";
import { __setTeamDb, insertMessage, queryMessages, queryConversations, deleteMessage, getMessageById } from "../../db.js";

const TEAM = "test-team";

function init() {
  const db = createTeamDB();
  __setTeamDb(TEAM, db);
  return db;
}

describe("Message CRUD", () => {
  beforeEach(() => {
    init();
  });

  it("insertMessage returns id and seq", () => {
    const result = insertMessage(TEAM, {
      type: "chat",
      from_user: "alice",
      to_user: "bob",
      content: "hello",
    });
    expect(result.id).toBeDefined();
    expect(result.seq).toBe(1);
  });

  it("getMessageById returns inserted message", () => {
    const { id } = insertMessage(TEAM, {
      type: "chat",
      from_user: "alice",
      to_user: "bob",
      content: "hi",
    });
    const msg = getMessageById(TEAM, id);
    expect(msg).not.toBeNull();
    expect(msg!.content).toBe("hi");
    expect(msg!.from_user).toBe("alice");
  });

  it("getMessageById returns null for unknown id", () => {
    expect(getMessageById(TEAM, "ghost")).toBeNull();
  });

  it("queryMessages returns messages after seq", () => {
    insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "bob", content: "msg1" });
    const { seq } = insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "bob", content: "msg2" });
    insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "bob", content: "msg3" });

    const result = queryMessages(TEAM, { user: "alice", after_seq: seq, limit: 10 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("msg3");
  });

  it("queryMessages respects limit with has_more", () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "bob", content: `msg${i}` });
    }
    const result = queryMessages(TEAM, { user: "alice", after_seq: 0, limit: 3 });
    expect(result.messages).toHaveLength(3);
    expect(result.has_more).toBe(true);
  });

  it("queryMessages includes channel messages", () => {
    insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "bob", content: "direct" });
    insertMessage(TEAM, { type: "chat", from_user: "charlie", to_user: "dave", content: "channel-msg", channel: "general" });

    const result = queryMessages(TEAM, { user: "alice", after_seq: 0, limit: 10 });
    const contents = result.messages.map((m) => m.content);
    expect(contents).toContain("direct");
    expect(contents).toContain("channel-msg");
  });

  it("queryConversations returns latest message per peer", () => {
    insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "bob", content: "first" });
    insertMessage(TEAM, { type: "chat", from_user: "bob", to_user: "alice", content: "second" });
    insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "charlie", content: "to-charlie" });

    const convos = queryConversations(TEAM, "alice");
    expect(convos).toHaveLength(2);
    const peers = convos.map((c) => c.peer).sort();
    expect(peers).toEqual(["bob", "charlie"]);
  });

  it("deleteMessage removes message", () => {
    const { id } = insertMessage(TEAM, { type: "chat", from_user: "alice", to_user: "bob", content: "delete-me" });
    expect(deleteMessage(TEAM, id)).toBe(true);
    expect(getMessageById(TEAM, id)).toBeNull();
  });

  it("deleteMessage returns false for unknown id", () => {
    expect(deleteMessage(TEAM, "ghost")).toBe(false);
  });

  it("insertMessage stores extra as JSON", () => {
    const { id } = insertMessage(TEAM, {
      type: "chat",
      from_user: "alice",
      to_user: "bob",
      content: "with-extra",
      extra: { replyTo: "msg-123" },
    });
    const msg = getMessageById(TEAM, id)!;
    expect(msg.extra).toBe(JSON.stringify({ replyTo: "msg-123" }));
  });

  it("insertMessage stores source and mentions", () => {
    const { id } = insertMessage(TEAM, {
      type: "chat",
      from_user: "alice",
      to_user: "bob",
      content: "mention",
      source: "ai-auto",
      mentions: "bob,charlie",
    });
    const msg = getMessageById(TEAM, id)!;
    expect(msg.source).toBe("ai-auto");
    expect(msg.mentions).toBe("bob,charlie");
  });
});
