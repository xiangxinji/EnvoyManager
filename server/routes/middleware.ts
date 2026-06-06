import type { Context, Next } from "hono";
import { validateSession } from "./admin.js";
import { validateClientToken, lookupClientSession } from "./users.js";

/** Require a valid admin Bearer token (Authorization header) */
export async function adminAuth(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || !validateSession(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

/** Require a valid client token (X-Envoy-Token header or ?token= query param).
 *  Sets c.set("userId"), c.set("role"), and c.set("authType", "client") from the session. */
export async function clientAuth(c: Context, next: Next) {
  const token = c.req.header("X-Envoy-Token") || c.req.query("token");
  if (!token || !validateClientToken(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const session = lookupClientSession(token);
  if (session) {
    c.set("userId", session.userId);
    c.set("role", session.role);
  }
  c.set("authType", "client");
  await next();
}

/** Accept either a valid admin Bearer token OR a valid client token.
 *  Sets c.set("authType", "admin" | "client") so handlers can distinguish identity. */
export async function dualAuth(c: Context, next: Next) {
  const adminToken = c.req.header("Authorization")?.replace("Bearer ", "");
  if (adminToken && validateSession(adminToken)) {
    c.set("authType", "admin");
    await next();
    return;
  }
  const clientToken = c.req.header("X-Envoy-Token") || c.req.query("token");
  if (clientToken && validateClientToken(clientToken)) {
    const session = lookupClientSession(clientToken);
    if (session) {
      c.set("userId", session.userId);
      c.set("role", session.role);
    }
    c.set("authType", "client");
    await next();
    return;
  }
  return c.json({ error: "unauthorized" }, 401);
}
