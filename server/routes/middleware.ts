import type { Context, Next } from "hono";
import { validateSession } from "./admin.js";
import { validateClientToken } from "./users.js";

/** Require a valid admin Bearer token (Authorization header) */
export async function adminAuth(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || !validateSession(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

/** Require a valid client token (X-Envoy-Token header or ?token= query param) */
export async function clientAuth(c: Context, next: Next) {
  const token = c.req.header("X-Envoy-Token") || c.req.query("token");
  if (!token || !validateClientToken(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

/** Accept either a valid admin Bearer token OR a valid client token */
export async function dualAuth(c: Context, next: Next) {
  const adminToken = c.req.header("Authorization")?.replace("Bearer ", "");
  if (adminToken && validateSession(adminToken)) {
    await next();
    return;
  }
  const clientToken = c.req.header("X-Envoy-Token") || c.req.query("token");
  if (clientToken && validateClientToken(clientToken)) {
    await next();
    return;
  }
  return c.json({ error: "unauthorized" }, 401);
}
