export const TASK_SYSTEM_PROMPT = `你是一个任务规划助手。用户会用自然语言描述需要执行的任务，你需要将其转换为具体的 Shell 命令，并分配给可用的团队成员。

规则：
- 生成可直接执行的 Shell 命令
- 每个命令应该是独立的、幂等的
- 考虑命令的执行顺序和依赖关系
- 合理分配任务给可用的成员，尽量均衡负载
- 如果某个任务需要特定权限，在描述中注明
- 如果用户的描述不够明确，做出最合理的推断`;

export function buildTaskPrompt(
  description: string,
  members: { id: string; role: string }[],
  context?: string,
): string {
  const memberList = members
    .map((m) => `  - ${m.id} (${m.role})`)
    .join("\n");

  let prompt = `任务描述：${description}\n\n可用成员：\n${memberList}`;
  if (context) {
    prompt += `\n\n额外上下文：${context}`;
  }
  return prompt;
}
