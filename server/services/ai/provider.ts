import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV1 } from "ai";
import type { ProviderType } from "../../../../shared/types/ai.js";

interface ResolveModelInput {
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export function resolveModel(input: ResolveModelInput): LanguageModelV1 {
  switch (input.provider) {
    case "openai":
      return createOpenAI({
        apiKey: input.apiKey,
        ...(input.baseURL ? { baseURL: input.baseURL } : {}),
      })(input.model) as LanguageModelV1;
    case "anthropic":
      return createAnthropic({
        apiKey: input.apiKey,
        ...(input.baseURL ? { baseURL: input.baseURL } : {}),
      })(input.model) as LanguageModelV1;
    case "google":
      return createGoogleGenerativeAI({
        apiKey: input.apiKey,
      })(input.model) as LanguageModelV1;
    case "deepseek":
      return createOpenAI({
        apiKey: input.apiKey,
        baseURL: input.baseURL ?? "https://api.deepseek.com/v1",
      })(input.model) as LanguageModelV1;
    case "openai-compatible":
      if (!input.baseURL) {
        throw new Error("baseURL is required for openai-compatible provider");
      }
      return createOpenAI({
        apiKey: input.apiKey,
        baseURL: input.baseURL,
      })(input.model) as LanguageModelV1;
    default:
      throw new Error(`Unknown provider: ${input.provider}`);
  }
}
