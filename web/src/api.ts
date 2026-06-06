const BASE = "/api";

export interface TeamInfo {
  name: string;
  port: number;
  createdAt: number;
  status: "running" | "stopped";
  stats: {
    totalClients: number;
    onlineClients: number;
    totalTasks: number;
    tasksByStatus: Record<string, number>;
  } | null;
}

export interface RecentTask {
  id: string;
  team: string;
  content: string;
  status: string;
  createBy: string;
  assignedTo: string | null;
  result: unknown;
  resources: { type: string; by: string; data: unknown; attempt: number }[];
  createdAt: number;
}

export interface DashboardData {
  totalTeams: number;
  totalOnline: number;
  totalTasks: number;
  taskSummary: Record<string, number>;
  recentTasks: RecentTask[];
}

export interface ServerClientInfo {
  id: string;
  role: "client" | "watcher";
  status: "online" | "offline";
  connectedAt: number;
  lastHeartbeat: number;
  queueLength: number;
  uptime: number;
}

export interface TaskInfo {
  id: string;
  createBy: string;
  subscribe: string[];
  content: string;
  mode: "serial" | "parallel";
  status: "pending" | "running" | "reviewing" | "completed" | "failed";
  resources: { type: string; by: string; data: unknown; attempt: number }[];
  assignedTo: string | null;
  result: unknown;
  createdAt: number;
  attempt: number;
}

export interface TaskDetailData extends Omit<TaskInfo, "assignedTo" | "result"> {
  assignedTo: string[];
  results: Array<{ by: string; data: unknown }>;
}

export interface UserInfo {
  username: string;
  role: "leader" | "member";
  responsibilities: string;
  capabilities: string;
  nickname: string | null;
  avatar_url: string | null;
  createdAt: number;
}

export interface UserProfile {
  username: string;
  nickname: string | null;
  avatar_url: string | null;
}

export interface TeamMember {
  username: string;
  nickname?: string | null;
  avatar_url?: string | null;
  responsibilities?: string;
  capabilities?: string;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  created_at: number;
  updated_at: number;
}

async function rsaEncrypt(publicKeyPem: string, plaintext: string): Promise<string> {
  if (!crypto.subtle) {
    throw new Error("RSA 加密需要安全上下文，请通过 http://localhost:5180 访问");
  }
  const binaryDer = pemToArrayBuffer(publicKeyPem);
  const key = await crypto.subtle.importKey("spki", binaryDer, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN.*?-----/, "").replace(/-----END.*?-----/, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const PUBLIC_PATHS = ["/public-key", "/admin/auth", "/auth", "/auth/verify", "/ai/health"];

async function getPublicKey(): Promise<string> {
  const res = await fetch(`${BASE}/public-key`);
  if (!res.ok) throw new Error("Failed to fetch public key");
  const data = await res.json();
  return data.key as string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (!isPublic && token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    if (localStorage.getItem("admin_token")) {
      localStorage.removeItem("admin_token");
      window.location.href = "/login";
    }
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  getDashboard: () => request<DashboardData>("/dashboard"),
  getTeams: () => request<TeamInfo[]>("/teams"),
  getTeam: (name: string) => request<TeamInfo>(`/teams/${name}`),
  getConfiguredMembers: (name: string) =>
    request<{ leader: { username: string; nickname: string | null; avatar_url: string | null }; members: TeamMember[] }>(`/teams/${name}/configured-members`),
  addTeamMember: (team: string, username: string, responsibilities?: string, capabilities?: string) =>
    request<{ ok: boolean }>(`/teams/${team}/members/${username}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responsibilities, capabilities }),
    }),
  removeTeamMember: (team: string, username: string) =>
    request<{ ok: boolean }>(`/teams/${team}/members/${username}`, { method: "DELETE" }),
  createTeam: (name: string, leader: string, port?: number) =>
    request<TeamInfo>("/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, leader, port }),
    }),
  deleteTeam: (name: string) =>
    request<{ ok: boolean }>(`/teams/${name}`, { method: "DELETE" }),
  getMembers: (name: string) => request<ServerClientInfo[]>(`/teams/${name}/members`),
  getTasks: (name: string) => request<TaskInfo[]>(`/teams/${name}/tasks`),
  getTaskDetail: (team: string, id: string) => request<TaskDetailData>(`/teams/${team}/tasks/${id}`),
  deleteTask: (team: string, id: string) =>
    request<{ ok: boolean }>(`/teams/${team}/tasks/${id}`, { method: "DELETE" }),
  deleteAllTasks: (team: string) =>
    request<{ ok: boolean; deletedCount: number }>(`/teams/${team}/tasks`, { method: "DELETE" }),
  getUsers: () => request<UserInfo[]>("/users"),
  createUser: async (username: string, password: string, role: "leader" | "member", responsibilities?: string, capabilities?: string, nickname?: string) => {
    const pubKey = await getPublicKey();
    const encrypted = await rsaEncrypt(pubKey, password);
    return request<UserInfo>("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: encrypted, role, responsibilities, capabilities, nickname }),
    });
  },
  deleteUser: (username: string) =>
    request<{ ok: boolean }>(`/users/${username}`, { method: "DELETE" }),
  updateUser: (username: string, data: { responsibilities?: string; capabilities?: string; nickname?: string | null }) =>
    request<{ ok: boolean }>(`/users/${username}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  uploadAvatar: async (username: string, file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const token = localStorage.getItem("admin_token");
    const res = await fetch(`${BASE}/users/${username}/avatar`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Upload failed");
    }
    return res.json() as Promise<{ avatar_url: string }>;
  },
  getProfiles: (names: string[]) =>
    request<UserProfile[]>(`/users/profiles?names=${names.join(",")}`),
  updateProfile: (username: string, data: { nickname?: string | null }) =>
    request<{ ok: boolean; nickname: string | null; avatar_url: string | null }>(`/users/${username}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  auth: async (username: string, password: string) => {
    const pubKey = await getPublicKey();
    const encrypted = await rsaEncrypt(pubKey, password);
    return request<{ ok: boolean; username: string; role: "leader" | "member" }>("/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: encrypted }),
    });
  },
  adminAuth: async (username: string, password: string) => {
    const pubKey = await getPublicKey();
    const encrypted = await rsaEncrypt(pubKey, password);
    return request<{ ok: boolean; token: string }>("/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: encrypted }),
    });
  },
  adminLogout: () =>
    request<{ ok: boolean }>("/admin/logout", {
      method: "POST",
    }),
  getAdminProfile: () =>
    request<{ username: string }>("/admin/profile"),
  updateAdmin: async (username: string, password: string) => {
    const pubKey = await getPublicKey();
    const encrypted = await rsaEncrypt(pubKey, password);
    return request<{ ok: boolean }>("/admin/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: encrypted }),
    });
  },

  // AI Configuration
  getAIConfig: () =>
    request<{
      presets: Array<{
        id: string;
        name: string;
        provider: string;
        model: string;
        baseURL?: string;
        apiKey: string;
        isDefault: boolean;
      }>;
      scenes: Record<string, { presetId: string | null; temperature: number; maxTokens: number }>;
      configured: boolean;
      defaultPreset?: { id: string; name: string; provider: string; model: string; isDefault: boolean };
    }>("/ai/config"),

  // Preset CRUD
  getPresets: () =>
    request<
      Array<{
        id: string;
        name: string;
        provider: string;
        model: string;
        baseURL?: string;
        apiKey: string;
        isDefault: boolean;
      }>
    >("/ai/presets"),
  createPreset: (data: {
    name: string;
    provider: string;
    model: string;
    baseURL?: string;
    apiKey: string;
  }) =>
    request<{ id: string; name: string }>("/ai/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updatePreset: (
    id: string,
    data: { name?: string; provider?: string; model?: string; baseURL?: string; apiKey?: string },
  ) =>
    request<{ id: string; name: string }>(`/ai/presets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deletePreset: (id: string) =>
    request<{ success: boolean }>(`/ai/presets/${id}`, {
      method: "DELETE",
    }),
  setDefaultPreset: (id: string) =>
    request<{ success: boolean }>(`/ai/presets/${id}/default`, {
      method: "PUT",
    }),

  // Scene Configuration
  getScenes: () =>
    request<
      Record<string, { presetId: string | null; presetName: string | null; temperature: number; maxTokens: number }>
    >("/ai/scenes"),
  updateScenes: (
    scenes: Record<string, { presetId: string | null; temperature: number; maxTokens: number }>,
  ) =>
    request<{ success: boolean }>("/ai/scenes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes }),
    }),

  getAIModels: () =>
    request<{ id: string; label: string; models: string[] }[]>("/ai/models"),
  checkAIHealth: () =>
    request<{ configured: boolean; provider: string; model: string }>("/ai/health"),

  // Cloud resources
  getCloudStats: (team: string) =>
    request<{ totalFiles: number; totalSize: number; totalDirs: number; byUser: Array<{ user: string; fileCount: number; totalSize: number }> }>("/cloud/stats", {
      headers: { team },
    }),

  getCloudFiles: (team: string, parentId?: string | null) =>
    request<{ id: string | null; parentId: string | null; name: string; items: Array<{ id: string; name: string; parentId: string | null; type: string; size: number; uploadedBy: string; createdAt: number }> }>(`/cloud/files${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`, {
      headers: { team },
    }),

  deleteCloudFile: (team: string, id: string) =>
    request<{ ok: boolean }>(`/cloud/files/${encodeURIComponent(id)}?from=admin`, {
      method: "DELETE",
      headers: { team },
    }),

  createCloudDir: (team: string, name: string, parentId?: string | null) =>
    request<{ ok: boolean; item: { id: string; name: string } }>("/cloud/directories", {
      method: "POST",
      headers: { "Content-Type": "application/json", team },
      body: JSON.stringify({ name, parentId: parentId || null, createdBy: "admin" }),
    }),

  searchCloudFiles: (team: string, query: string) =>
    request<Array<{ id: string; name: string; displayPath: string; type: string; size: number }>>(`/cloud/search?q=${encodeURIComponent(query)}`, {
      headers: { team },
    }),

  // Brains / Knowledge base
  getBrainsStats: (team: string) =>
    request<{ totalFiles: number; totalSize: number; byUser: Array<{ user: string; fileCount: number; totalSize: number }> }>("/brains/stats", {
      headers: { team },
    }),

  getBrainsFiles: (team: string, username: string, includeBackups = false) =>
    request<{ files: Array<{ path: string; mtime_ms: number; size: number }> }>(`/brains/files?username=${encodeURIComponent(username)}&includeBackups=${includeBackups}`, {
      headers: { team },
    }),

  // Glossary — Global
  getGlobalGlossary: () =>
    request<GlossaryEntry[]>("/glossary/global"),
  createGlobalGlossaryEntry: (term: string, definition: string) =>
    request<GlossaryEntry>("/glossary/global", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, definition }),
    }),
  updateGlobalGlossaryEntry: (id: string, term: string, definition: string) =>
    request<GlossaryEntry>(`/glossary/global/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, definition }),
    }),
  deleteGlobalGlossaryEntry: (id: string) =>
    request<{ success: boolean }>(`/glossary/global/${id}`, {
      method: "DELETE",
    }),

  // Glossary — Team
  getTeamGlossary: (team: string) =>
    request<GlossaryEntry[]>(`/glossary/team?team=${encodeURIComponent(team)}`),
  createTeamGlossaryEntry: (team: string, term: string, definition: string) =>
    request<GlossaryEntry>(`/glossary/team?team=${encodeURIComponent(team)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, definition }),
    }),
  updateTeamGlossaryEntry: (team: string, id: string, term: string, definition: string) =>
    request<GlossaryEntry>(`/glossary/team/${id}?team=${encodeURIComponent(team)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, definition }),
    }),
  deleteTeamGlossaryEntry: (team: string, id: string) =>
    request<{ success: boolean }>(`/glossary/team/${id}?team=${encodeURIComponent(team)}`, {
      method: "DELETE",
    }),
};
