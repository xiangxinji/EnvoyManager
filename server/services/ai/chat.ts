import { streamText } from "ai";
import type { Context } from "hono";
import type { ChatRequest } from "../../../../shared/types/ai.js";
import type { ResolvedScene } from "../../settings.js";
import { buildChatMessages } from "./prompts/chat.js";
import { buildAutoReplyMessages } from "./prompts/auto-reply.js";
import { toStandardSSE } from "./stream.js";

export async function handleChatStream(c: Context, resolved: ResolvedScene) {
  const body = await c.req.json<ChatRequest>();

  if (!body.messages?.length) {
    return c.json({ error: "messages is required" }, 400);
  }

  const messages = buildChatMessages(body.messages, body.context);

  const result = streamText({
    model: resolved.model,
    messages,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
  });

  const sse = toStandardSSE(result);

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function handleChatGenerate(c: Context, resolved: ResolvedScene) {
  const { generateText } = await import("ai");
  const body = await c.req.json<ChatRequest>();

  if (!body.messages?.length) {
    return c.json({ error: "messages is required" }, 400);
  }

  const messages = buildChatMessages(body.messages, body.context);

  const result = await generateText({
    model: resolved.model,
    messages,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
  });

  return c.json({
    text: result.text,
    usage: result.usage,
    finishReason: result.finishReason,
  });
}

export async function handleAutoReplyGenerate(c: Context, resolved: ResolvedScene) {
  const { generateText } = await import("ai");
  const body = await c.req.json<ChatRequest & { context?: { username: string; role: string; team: string } }>();

  if (!body.messages?.length) {
    return c.json({ error: "messages is required" }, 400);
  }

  const ctx = body.context ?? {};
  const messages = buildAutoReplyMessages(body.messages, {
    username: ctx.username ?? "user",
    role: ctx.role ?? "member",
    team: ctx.team ?? "team",
  });

  const result = await generateText({
    model: resolved.model,
    messages,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
  });

  return c.json({
    text: result.text,
    usage: result.usage,
    finishReason: result.finishReason,
  });
}
