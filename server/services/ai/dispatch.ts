import { generateObject } from "ai";
import { z } from "zod";
import type { Context } from "hono";
import type { ResolvedScene } from "../../settings.js";
import { DISPATCH_SYSTEM_PROMPT } from "./prompts/dispatch.js";

interface DispatchRequest {
  description: string;
  members: Array<{ id: string; responsibilities: string; capabilities: string }>;
}

const dispatchSchema = z.object({
  subscribe: z.array(z.string()).describe("匹配到的成员 ID 列表"),
  content: z.string().describe("优化后的任务描述"),
});

export async function handleTaskDispatch(c: Context, resolved: ResolvedScene) {
  const body = await c.req.json<DispatchRequest>();

  if (!body.description) {
    return c.json({ error: "description is required" }, 400);
  }
  if (!body.members?.length) {
    return c.json({ error: "members is required" }, 400);
  }

  const memberList = body.members
    .map((m) => {
      const parts = [`  - ${m.id}:`];
      if (m.responsibilities) parts.push(`    职责: ${m.responsibilities}`);
      if (m.capabilities) parts.push(`    能力: ${m.capabilities}`);
      if (!m.responsibilities && !m.capabilities) parts.push("    无描述");
      return parts.join("\n");
    })
    .join("\n");

  const prompt = `任务描述：${body.description}\n\n可用成员：\n${memberList}`;

  const result = await generateObject({
    model: resolved.model,
    system: DISPATCH_SYSTEM_PROMPT,
    prompt,
    schema: dispatchSchema,
    schemaName: "TaskDispatch",
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
  });

  return c.json(result.object);
}
