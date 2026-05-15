import { generateObject } from "ai";
import { z } from "zod";
import type { Context } from "hono";
import type { ResolvedScene } from "../../settings.js";
import { REVIEW_SYSTEM_PROMPT } from "./prompts/review.js";

interface ReviewRequest {
  taskDescription: string;
  results: Array<{ from: string; data: unknown }>;
  resources?: Array<{ by: string; filename: string; size: number }>;
}

const reviewSchema = z.object({
  success: z.boolean().describe("任务结果是否通过审查"),
  summary: z.string().describe("审查总结，说明通过或不通过的原因"),
});

export async function handleTaskReview(c: Context, resolved: ResolvedScene) {
  const body = await c.req.json<ReviewRequest>();

  if (!body.taskDescription) {
    return c.json({ error: "taskDescription is required" }, 400);
  }
  if (!body.results?.length) {
    return c.json({ error: "results is required" }, 400);
  }

  const resultsText = body.results
    .map((r) => `【${r.from}】:\n${JSON.stringify(r.data, null, 2)}`)
    .join("\n\n");

  let resourcesText = "";
  if (body.resources && body.resources.length > 0) {
    resourcesText = "\n\n成员上传的文件：\n" + body.resources
      .map((r) => `- ${r.by}: ${r.filename} (${r.size} bytes)`)
      .join("\n");
  }

  const prompt = `任务描述：${body.taskDescription}\n\n成员执行结果：\n${resultsText}${resourcesText}`;

  try {
    const result = await generateObject({
      model: resolved.model,
      system: REVIEW_SYSTEM_PROMPT,
      prompt,
      schema: reviewSchema,
      schemaName: "TaskReview",
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
    });

    return c.json(result.object);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[task-review] AI call failed:", msg);
    return c.json({ error: `AI call failed: ${msg}` }, 500);
  }
}
