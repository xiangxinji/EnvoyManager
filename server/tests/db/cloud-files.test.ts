import { describe, it, expect, beforeEach } from "vitest";
import { createTeamDB } from "../helpers/team-db.js";
import {
  __setTeamDb,
  insertCloudFile,
  getCloudFileById,
  queryCloudDir,
  findCloudFile,
  deleteCloudFile,
  deleteCloudDirRecursive,
  searchCloudFiles,
  validateCloudIds,
  getCloudStats,
  buildCloudPath,
  getCloudBreadcrumb,
} from "../../db.js";

const TEAM = "test-team";

function init() {
  const db = createTeamDB();
  __setTeamDb(TEAM, db);
  return db;
}

describe("Cloud Files CRUD", () => {
  beforeEach(() => {
    init();
  });

  it("insertCloudFile creates a file record", () => {
    const record = insertCloudFile(TEAM, {
      name: "test.txt",
      parent_id: null,
      type: "file",
      size: 100,
      uploaded_by: "alice",
    });
    expect(record.id).toBeDefined();
    expect(record.name).toBe("test.txt");
    expect(record.type).toBe("file");
  });

  it("getCloudFileById returns inserted file", () => {
    const created = insertCloudFile(TEAM, { name: "a.txt", parent_id: null, type: "file", size: 50, uploaded_by: "bob" });
    const found = getCloudFileById(TEAM, created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("a.txt");
  });

  it("getCloudFileById returns undefined for unknown", () => {
    expect(getCloudFileById(TEAM, "ghost")).toBeUndefined();
  });

  it("queryCloudDir lists root files", () => {
    insertCloudFile(TEAM, { name: "dir1", parent_id: null, type: "directory", size: 0, uploaded_by: "alice" });
    insertCloudFile(TEAM, { name: "file1.txt", parent_id: null, type: "file", size: 10, uploaded_by: "alice" });
    const items = queryCloudDir(TEAM, null);
    expect(items).toHaveLength(2);
    // type DESC: "file" > "directory" alphabetically
    expect(items[0].type).toBe("file");
    expect(items[1].type).toBe("directory");
  });

  it("queryCloudDir lists children of a directory", () => {
    const dir = insertCloudFile(TEAM, { name: "mydir", parent_id: null, type: "directory", size: 0, uploaded_by: "alice" });
    insertCloudFile(TEAM, { name: "inner.txt", parent_id: dir.id, type: "file", size: 20, uploaded_by: "bob" });
    const children = queryCloudDir(TEAM, dir.id);
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe("inner.txt");
  });

  it("findCloudFile finds by name in parent", () => {
    insertCloudFile(TEAM, { name: "unique.txt", parent_id: null, type: "file", size: 5, uploaded_by: "alice" });
    const found = findCloudFile(TEAM, null, "unique.txt");
    expect(found).toBeDefined();
    expect(found!.name).toBe("unique.txt");
  });

  it("findCloudFile returns undefined when not found", () => {
    expect(findCloudFile(TEAM, null, "missing.txt")).toBeUndefined();
  });

  it("deleteCloudFile removes file", () => {
    const f = insertCloudFile(TEAM, { name: "del.txt", parent_id: null, type: "file", size: 1, uploaded_by: "alice" });
    expect(deleteCloudFile(TEAM, f.id)).toBe(true);
    expect(getCloudFileById(TEAM, f.id)).toBeUndefined();
  });

  it("deleteCloudFile returns false for unknown", () => {
    expect(deleteCloudFile(TEAM, "ghost")).toBe(false);
  });

  it("deleteCloudDirRecursive removes directory and children", () => {
    const dir = insertCloudFile(TEAM, { name: "top", parent_id: null, type: "directory", size: 0, uploaded_by: "alice" });
    insertCloudFile(TEAM, { name: "f1.txt", parent_id: dir.id, type: "file", size: 10, uploaded_by: "alice" });
    const sub = insertCloudFile(TEAM, { name: "sub", parent_id: dir.id, type: "directory", size: 0, uploaded_by: "alice" });
    insertCloudFile(TEAM, { name: "f2.txt", parent_id: sub.id, type: "file", size: 20, uploaded_by: "alice" });

    const count = deleteCloudDirRecursive(TEAM, dir.id);
    expect(count).toBe(4); // dir + f1 + sub + f2
    expect(queryCloudDir(TEAM, null)).toHaveLength(0);
  });

  it("searchCloudFiles finds by pattern", () => {
    insertCloudFile(TEAM, { name: "report.pdf", parent_id: null, type: "file", size: 100, uploaded_by: "alice" });
    insertCloudFile(TEAM, { name: "notes.txt", parent_id: null, type: "file", size: 50, uploaded_by: "bob" });
    const results = searchCloudFiles(TEAM, "rep");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("report.pdf");
  });

  it("searchCloudFiles escapes LIKE wildcards", () => {
    insertCloudFile(TEAM, { name: "100%.txt", parent_id: null, type: "file", size: 10, uploaded_by: "alice" });
    const results = searchCloudFiles(TEAM, "%");
    expect(results).toHaveLength(1);
  });

  it("validateCloudIds returns existence map", () => {
    const f = insertCloudFile(TEAM, { name: "exists.txt", parent_id: null, type: "file", size: 1, uploaded_by: "alice" });
    const result = validateCloudIds(TEAM, [f.id, "ghost"]);
    expect(result[f.id]).toBe(true);
    expect(result["ghost"]).toBe(false);
  });

  it("validateCloudIds with empty array returns empty", () => {
    expect(validateCloudIds(TEAM, [])).toEqual({});
  });

  it("getCloudStats returns aggregated stats", () => {
    insertCloudFile(TEAM, { name: "a.txt", parent_id: null, type: "file", size: 100, uploaded_by: "alice" });
    insertCloudFile(TEAM, { name: "b.txt", parent_id: null, type: "file", size: 200, uploaded_by: "bob" });
    insertCloudFile(TEAM, { name: "dir", parent_id: null, type: "directory", size: 0, uploaded_by: "alice" });

    const stats = getCloudStats(TEAM);
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalSize).toBe(300);
    expect(stats.totalDirs).toBe(1);
    expect(stats.byUser).toHaveLength(2);
  });

  it("buildCloudPath returns full path", () => {
    const dir = insertCloudFile(TEAM, { name: "docs", parent_id: null, type: "directory", size: 0, uploaded_by: "alice" });
    const file = insertCloudFile(TEAM, { name: "readme.md", parent_id: dir.id, type: "file", size: 50, uploaded_by: "alice" });
    expect(buildCloudPath(TEAM, file.id)).toBe("docs/readme.md");
  });

  it("getCloudBreadcrumb returns path segments", () => {
    const dir = insertCloudFile(TEAM, { name: "docs", parent_id: null, type: "directory", size: 0, uploaded_by: "alice" });
    const file = insertCloudFile(TEAM, { name: "readme.md", parent_id: dir.id, type: "file", size: 50, uploaded_by: "alice" });
    const bc = getCloudBreadcrumb(TEAM, file.id);
    expect(bc).toEqual([
      { id: dir.id, name: "docs" },
      { id: file.id, name: "readme.md" },
    ]);
  });

  it("getCloudBreadcrumb returns empty for null", () => {
    expect(getCloudBreadcrumb(TEAM, null)).toEqual([]);
  });
});
