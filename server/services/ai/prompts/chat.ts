export const CHAT_SYSTEM_PROMPT = `你是一个团队协作助手。你的任务是帮助用户更高效地进行沟通。

规则：
- 回复简洁、专业、友好
- 根据对话上下文生成合适的回复建议
- 如果用户要求修改语气或风格，请遵从
- 用与输入相同的语言回复
- 不要添加多余的解释，直接给出建议的回复内容`;

export function buildChatMessages(
  messages: { role: "user" | "assistant"; content: string }[],
  context?: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const system = context
    ? `${CHAT_SYSTEM_PROMPT}\n\n当前上下文：${context}`
    : CHAT_SYSTEM_PROMPT;

  return [{ role: "system", content: system }, ...messages];
}
