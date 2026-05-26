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

async function getPublicKey(): Promise<string> {
  const res = await fetch(`${BASE}/public-key`);
  if (!res.ok) throw new Error("Failed to fetch public key");
  const data = await res.json();
  return data.key as string;
}

let reloginPromise: Promise<boolean> | null = null;

async function tryRelogin(): Promise<boolean> {
  const saved = localStorage.getItem("admin_credentials");
  if (!saved) return false;
  try {
    const { username, password } = JSON.parse(saved);
    const res = await api.adminAuth(username, password);
    localStorage.setItem("admin_token", res.token);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (res.status === 401) {
    // Try silent re-login once
    if (!reloginPromise) {
      reloginPromise = tryRelogin();
    }
    const recovered = await reloginPromise;
    reloginPromise = null;

    if (recovered) {
      // Retry original request with fresh token
      const retryHeaders = new Headers(init?.headers);
      const token = localStorage.getItem("admin_token") || "";
      retryHeaders.set("Authorization", `Bearer ${token}`);
      const retryRes = await fetch(`${BASE}${path}`, { ...init, headers: retryHeaders });
      if (retryRes.status === 401) {
        // Fresh token also rejected — give up
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_credentials");
        window.location.href = "/login";
        throw new Error("unauthorized");
      }
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
        throw new Error(err.error || "Request failed");
      }
      return retryRes.json();
    }

    // Recovery failed — redirect to login
    if (localStorage.getItem("admin_token")) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_credentials");
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
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),
  getAdminProfile: () =>
    request<{ username: string }>("/admin/profile", {
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),
  updateAdmin: async (username: string, password: string) => {
    const pubKey = await getPublicKey();
    const encrypted = await rsaEncrypt(pubKey, password);
    return request<{ ok: boolean }>("/admin/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}`,
      },
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
    }>("/ai/config", {
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),

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
    >("/ai/presets", {
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),
  createPreset: (data: {
    name: string;
    provider: string;
    model: string;
    baseURL?: string;
    apiKey: string;
  }) =>
    request<{ id: string; name: string }>("/ai/presets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}`,
      },
      body: JSON.stringify(data),
    }),
  updatePreset: (
    id: string,
    data: { name?: string; provider?: string; model?: string; baseURL?: string; apiKey?: string },
  ) =>
    request<{ id: string; name: string }>(`/ai/presets/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}`,
      },
      body: JSON.stringify(data),
    }),
  deletePreset: (id: string) =>
    request<{ success: boolean }>(`/ai/presets/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),
  setDefaultPreset: (id: string) =>
    request<{ success: boolean }>(`/ai/presets/${id}/default`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),

  // Scene Configuration
  getScenes: () =>
    request<
      Record<string, { presetId: string | null; presetName: string | null; temperature: number; maxTokens: number }>
    >("/ai/scenes", {
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),
  updateScenes: (
    scenes: Record<string, { presetId: string | null; temperature: number; maxTokens: number }>,
  ) =>
    request<{ success: boolean }>("/ai/scenes", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}`,
      },
      body: JSON.stringify({ scenes }),
    }),

  getAIModels: () =>
    request<{ id: string; label: string; models: string[] }[]>("/ai/models", {
      headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),
  checkAIHealth: () =>
    request<{ configured: boolean; provider: string; model: string }>("/ai/health"),

  // Cloud resources
  getCloudStats: (team: string) =>
    request<{ totalFiles: number; totalSize: number; totalDirs: number; byUser: Array<{ user: string; fileCount: number; totalSize: number }> }>("/cloud/stats", {
      headers: { team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),

  getCloudFiles: (team: string, parentId?: string | null) =>
    request<{ id: string | null; parentId: string | null; name: string; items: Array<{ id: string; name: string; parentId: string | null; type: string; size: number; uploadedBy: string; createdAt: number }> }>(`/cloud/files${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`, {
      headers: { team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),

  deleteCloudFile: (team: string, id: string) =>
    request<{ ok: boolean }>(`/cloud/files/${encodeURIComponent(id)}?from=admin`, {
      method: "DELETE",
      headers: { team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),

  createCloudDir: (team: string, name: string, parentId?: string | null) =>
    request<{ ok: boolean; item: { id: string; name: string } }>("/cloud/directories", {
      method: "POST",
      headers: { "Content-Type": "application/json", team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
      body: JSON.stringify({ name, parentId: parentId || null, createdBy: "admin" }),
    }),

  searchCloudFiles: (team: string, query: string) =>
    request<Array<{ id: string; name: string; displayPath: string; type: string; size: number }>>(`/cloud/search?q=${encodeURIComponent(query)}`, {
      headers: { team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),

  // Brains / Knowledge base
  getBrainsStats: (team: string) =>
    request<{ totalFiles: number; totalSize: number; byUser: Array<{ user: string; fileCount: number; totalSize: number }> }>("/brains/stats", {
      headers: { team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),

  getBrainsFiles: (team: string, username: string, includeBackups = false) =>
    request<{ files: Array<{ path: string; mtime_ms: number; size: number }> }>(`/brains/files?username=${encodeURIComponent(username)}&includeBackups=${includeBackups}`, {
      headers: { team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    }),
};
