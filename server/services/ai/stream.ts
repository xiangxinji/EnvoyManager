import { streamText } from "ai";

export function toStandardSSE(
  result: ReturnType<typeof streamText>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const encode = (event: string, data: object) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const textPart of result.textStream) {
          controller.enqueue(encode("text-delta", { text: textPart }));
        }

        const [finishReason, usage, steps] = await Promise.all([
          result.finishReason,
          result.usage,
          result.steps,
        ]);

        const stepsData = steps as Array<{
          toolCalls?: Array<{ toolCallId: string; toolName: string; args: unknown }>;
          toolResults?: Array<{ toolCallId: string; result: unknown }>;
        }>;

        for (const step of stepsData) {
          for (const tc of step.toolCalls ?? []) {
            controller.enqueue(
              encode("tool-call", {
                callId: tc.toolCallId,
                tool: tc.toolName,
                args: tc.args,
              }),
            );
          }
          for (const tr of step.toolResults ?? []) {
            controller.enqueue(
              encode("tool-result", {
                callId: tr.toolCallId,
                result: tr.result,
              }),
            );
          }
        }

        controller.enqueue(
          encode("done", {
            finishReason: finishReason ?? "stop",
            usage: usage ?? { promptTokens: 0, completionTokens: 0 },
          }),
        );
      } catch (err) {
        controller.enqueue(
          encode("error", { message: err instanceof Error ? err.message : String(err) }),
        );
      } finally {
        controller.close();
      }
    },
  });
}
