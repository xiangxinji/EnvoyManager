import { generateObject } from "ai";
import { z } from "zod";
import type { Context } from "hono";
import type { ResolvedScene } from "../../settings.js";
import { CLOUD_ORGANIZE_SYSTEM_PROMPT } from "./prompts/cloudOrganize.js";

interface CloudOrganizeRequest {
  directoryTree: string;
  filename: string;
  description: string;
  taskContext?: string;
}

const cloudOrganizeSchema = z.object({
  reasoning: z.string().describe("分类推理过程"),
  directoryPath: z.array(z.string()).describe("目标目录路径，从根目录开始，每级一个元素。空数组表示根目录"),
});

export async function handleCloudOrganize(c: Context, resolved: ResolvedScene) {
  const body = await c.req.json<CloudOrganizeRequest>();

  if (!body.filename) {
    return c.json({ error: "filename is required" }, 400);
  }
  if (!body.description) {
    return c.json({ error: "description is required" }, 400);
  }

  const treeSection = body.directoryTree
    ? `当前目录结构：\n${body.directoryTree}`
    : "当前目录结构：（空）";

  const contextSection = body.taskContext
    ? `\n任务上下文：${body.taskContext}`
    : "";

  const prompt = `${treeSection}\n\n文件名：${body.filename}\n文件描述：${body.description}${contextSection}`;

  try {
    const result = await generateObject({
      model: resolved.model,
      system: CLOUD_ORGANIZE_SYSTEM_PROMPT,
      prompt,
      schema: cloudOrganizeSchema,
      schemaName: "CloudOrganize",
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
    });

    return c.json(result.object);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cloud-organize] AI call failed:", msg);
    return c.json({ error: `AI call failed: ${msg}` }, 500);
  }
}
