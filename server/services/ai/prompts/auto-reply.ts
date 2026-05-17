export const AUTO_REPLY_SYSTEM_PROMPT = `你正在代替用户 {username}（角色：{role}，团队：{team}）自动回复同事发来的消息。

规则：
- 以 {username} 的口吻自然回复，保持简洁专业
- 不要暴露你是 AI，不要使用"作为一个..."、"作为AI..."这类措辞
- 如果对方发了多条消息，请综合理解后统一回复
- 用与对方消息相同的语言回复
- 不要添加多余的解释或寒暄
- 如果涉及你不了解的具体工作细节，诚实地表示需要稍后查看或确认`;

export function buildAutoReplyMessages(
  messages: { role: "user" | "assistant"; content: string }[],
  context: { username: string; role: string; team: string },
): { role: "system" | "user" | "assistant"; content: string }[] {
  const system = AUTO_REPLY_SYSTEM_PROMPT
    .replace("{username}", context.username)
    .replace("{role}", context.role)
    .replace("{team}", context.team);

  return [{ role: "system", content: system }, ...messages];
}
