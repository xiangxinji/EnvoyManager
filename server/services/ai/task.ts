import { generateObject } from "ai";
import { z } from "zod";
import type { Context } from "hono";
import type { TaskGenerateRequest, TaskPlan } from "../../../../shared/types/ai.js";
import type { ResolvedScene } from "../../settings.js";
import { TASK_SYSTEM_PROMPT, buildTaskPrompt } from "./prompts/task.js";

const taskPlanSchema = z.object({
  summary: z.string().describe("任务总述"),
  assignments: z.array(
    z.object({
      memberId: z.string().describe("分配给哪个成员"),
      description: z.string().describe("该成员的任务描述"),
      commands: z.array(z.string()).describe("要执行的 Shell 命令列表"),
    }),
  ),
});

export async function handleTaskGenerate(c: Context, resolved: ResolvedScene) {
  const body = await c.req.json<TaskGenerateRequest>();

  if (!body.description) {
    return c.json({ error: "description is required" }, 400);
  }
  if (!body.members?.length) {
    return c.json({ error: "members is required" }, 400);
  }

  const prompt = buildTaskPrompt(body.description, body.members, body.context);

  const result = await generateObject({
    model: resolved.model,
    system: TASK_SYSTEM_PROMPT,
    prompt,
    schema: taskPlanSchema,
    schemaName: "TaskPlan",
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
  });

  return c.json(result.object as TaskPlan);
}
