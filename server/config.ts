const isProduction = process.env.NODE_ENV === "production";

function parseList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const managerPort = Number(process.env.MANAGER_PORT) || 8080;

export const teamHost = process.env.ENVOY_TEAM_HOST || (isProduction ? "127.0.0.1" : "0.0.0.0");

export const corsOrigins = parseList(
  process.env.MANAGER_CORS_ORIGINS ||
    (isProduction
      ? "tauri://localhost,http://tauri.localhost,https://tauri.localhost"
      : "http://localhost:1420,http://localhost:5180,https://localhost:5180,http://127.0.0.1:1420,http://127.0.0.1:5180,https://127.0.0.1:5180"),
);

export function resolveCorsOrigin(origin: string): string | undefined {
  if (!origin) return undefined;
  if (corsOrigins.includes(origin)) return origin;
  return undefined;
}
