import Anthropic from "@anthropic-ai/sdk";
import type { ClassifierClient } from "./classify";

const MODEL = "claude-opus-5";

/**
 * On claude-opus-5, thinking is on by default and max_tokens caps thinking
 * and the visible answer together. 4096 risks the model spending its whole
 * budget thinking and truncating the JSON answer before it is written.
 */
const MAX_TOKENS = 16000;

/**
 * Opts a request into server-side retry on the model's default fallback
 * chain when the primary model declines for policy reasons, instead of the
 * caller having to retry by hand.
 */
export const REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * The minimal shape this adapter needs from an Anthropic client, so tests
 * can inject a fake without constructing a real SDK client or making any
 * network calls.
 */
export interface BetaMessagesClient {
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
      ): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
}

/**
 * Synchronous ClassifierClient backed by the real Claude API.
 *
 * Structured outputs make the response schema-valid by construction, so
 * callers can JSON.parse without defensive handling — provided the answer
 * wasn't cut short (checked below) or refused outright.
 *
 * `betas: [REFUSAL_FALLBACK_BETA]` plus `fallbacks: "default"` lets the API
 * retry on the requested model's server-defined fallback chain when the
 * primary model refuses. Even with that chain, `stop_reason === "refusal"`
 * on the final response means every model in the chain declined.
 */
export function createAnthropicClient(
  apiKey: string,
  client: BetaMessagesClient = new Anthropic({ apiKey }),
): ClassifierClient {
  return {
    async complete(prompt: string, schema: object): Promise<string> {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // `schema` is typed `object` by the ClassifierClient interface (owned
        // by classify.ts, not modified here); the SDK wants an indexable
        // record. The callers only ever pass plain JSON-schema object
        // literals, so this cast is safe.
        output_config: {
          format: { type: "json_schema", schema: schema as Record<string, unknown> },
        },
        messages: [{ role: "user", content: prompt }],
        betas: [REFUSAL_FALLBACK_BETA],
        fallbacks: "default",
      });

      if (response.stop_reason === "refusal") {
        throw new Error(
          "model declined the request — the entire fallback chain refused",
        );
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error(
          "response truncated: hit max_tokens before finishing — the JSON answer is likely incomplete",
        );
      }

      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") {
        throw new Error("no text block in response");
      }
      return text.text;
    },
  };
}
