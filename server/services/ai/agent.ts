import { generateText, tool, jsonSchema } from "ai";
import type { Context } from "hono";
import type { ResolvedScene } from "../../settings.js";
import { AGENT_SYSTEM_PROMPT } from "./prompts/agent.js";

interface AgentReasonRequest {
  messages: Array<{
    role: string;
    content: string;
    toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
    toolCallId?: string;
    toolName?: string;
  }>;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export async function handleAgentReason(c: Context, resolved: ResolvedScene) {
  const body = await c.req.json<AgentReasonRequest>();

  if (!body.messages?.length) {
    return c.json({ error: "messages and tools are required" }, 400);
  }
  if (!body.tools?.length) {
    return c.json({ error: "messages and tools are required" }, 400);
  }

  // Convert JSON schema tool definitions to ai-sdk tool definitions
  const tools: Record<string, ReturnType<typeof tool>> = {};
  for (const t of body.tools) {
    tools[t.name] = tool({
      description: t.description,
      parameters: jsonSchema(t.parameters),
    });
  }

  // Build messages with system prompt — convert to ai-sdk CoreMessage format
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
  ];

  // Accumulate consecutive tool-result messages into batches
  let pendingToolResults: Array<{ type: "tool-result"; toolCallId: string; toolName: string; result: string }> = [];

  function flushToolResults() {
    if (pendingToolResults.length > 0) {
      messages.push({ role: "tool", content: pendingToolResults });
      pendingToolResults = [];
    }
  }

  for (const m of body.messages) {
    if (m.toolCalls) {
      flushToolResults();
      const content: Array<Record<string, unknown>> = [];
      if (m.content) {
        content.push({ type: "text", text: m.content });
      }
      for (const tc of m.toolCalls) {
        content.push({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.args,
        });
      }
      messages.push({ role: "assistant", content });
    } else if (m.toolCallId) {
      pendingToolResults.push({
        type: "tool-result",
        toolCallId: m.toolCallId,
        toolName: m.toolName ?? "unknown",
        result: m.content,
      });
    } else {
      flushToolResults();
      messages.push({ role: m.role, content: m.content });
    }
  }
  flushToolResults();

  let result: Awaited<ReturnType<typeof generateText>>;
  try {
    result = await generateText({
      model: resolved.model,
      messages,
      tools,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[agent-reason] AI call failed:", msg);
    return c.json({ error: `AI call failed: ${msg}` }, 500);
  }

  // Extract tool calls if any
  const toolCalls = result.toolCalls?.map((tc) => ({
    id: tc.toolCallId,
    name: tc.toolName,
    args: tc.args,
  }));

  return c.json({
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    text: result.text || undefined,
    done: !toolCalls?.length,
    usage: result.usage,
  });
}
