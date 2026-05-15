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
  createdAt: number;
}

export interface TeamMember {
  username: string;
  responsibilities?: string;
  capabilities?: string;
}

async function rsaEncrypt(publicKeyPem: string, plaintext: string): Promise<string> {
  if (!crypto.subtle) {
    throw new Error("RSA 加密需要安全上下文（HTTPS 或 localhost），请通过 http://localhost:5180 访问");
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
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
    request<{ leader: string; members: TeamMember[] }>(`/teams/${name}/configured-members`),
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
  createUser: async (username: string, password: string, role: "leader" | "member", responsibilities?: string, capabilities?: string) => {
    const pubKey = await getPublicKey();
    const encrypted = await rsaEncrypt(pubKey, password);
    return request<UserInfo>("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: encrypted, role, responsibilities, capabilities }),
    });
  },
  deleteUser: (username: string) =>
    request<{ ok: boolean }>(`/users/${username}`, { method: "DELETE" }),
  updateUser: (username: string, data: { responsibilities?: string; capabilities?: string }) =>
    request<{ ok: boolean }>(`/users/${username}`, {
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
};
