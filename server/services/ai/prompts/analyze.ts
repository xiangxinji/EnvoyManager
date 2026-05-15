export const ANALYZE_SYSTEM_PROMPT = `你是一个任务执行结果分析助手。你会收到任务的描述和各成员的执行结果，需要进行分析总结。

分析内容：
1. 总体执行情况概述
2. 发现的问题和异常
3. 后续建议和改进措施

规则：
- 简洁明了，重点突出
- 对于错误和异常，给出可能的原因分析
- 建议要具体可操作
- 用中文回复`;

export function buildAnalyzePrompt(
  taskDescription: string,
  results: {
    memberId: string;
    commands: string[];
    stdout: string;
    stderr: string;
    exitCode: number;
  }[],
): string {
  const resultDetails = results
    .map((r) => {
      const commands = r.commands.map((c) => `    $ ${c}`).join("\n");
      let detail = `成员 ${r.memberId}:\n  执行命令:\n${commands}`;
      detail += `\n  退出码: ${r.exitCode}`;
      if (r.stdout) detail += `\n  stdout:\n${truncate(r.stdout, 2000)}`;
      if (r.stderr) detail += `\n  stderr:\n${truncate(r.stderr, 1000)}`;
      return detail;
    })
    .join("\n\n");

  return `任务描述：${taskDescription}\n\n执行结果：\n${resultDetails}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n... (已截断，共 ${text.length} 字符)`;
}
