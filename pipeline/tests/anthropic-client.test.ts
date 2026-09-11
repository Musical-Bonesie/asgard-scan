import { describe, expect, test, vi } from "vitest";
import { createAnthropicClient, REFUSAL_FALLBACK_BETA } from "../src/anthropic-client";

const SCHEMA = { type: "object", properties: {}, additionalProperties: false };

function fakeClient(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { create } } }, create };
}

describe("createAnthropicClient", () => {
  test("returns the text of the first text block when a fallback block precedes it", async () => {
    const { client } = fakeClient({
      stop_reason: "end_turn",
      content: [
        { type: "fallback", model: "claude-opus-5", index: 0 },
        { type: "text", text: '{"ok":true}' },
      ],
    });

    const anthropic = createAnthropicClient("key", client);
    const result = await anthropic.complete("prompt", SCHEMA);

    expect(result).toBe('{"ok":true}');
  });

  test("throws when the entire fallback chain refuses", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", content: [] });

    const anthropic = createAnthropicClient("key", client);

    await expect(anthropic.complete("prompt", SCHEMA)).rejects.toThrow();
  });

  test("throws a truncation-specific error on stop_reason max_tokens", async () => {
    const { client } = fakeClient({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"incomple' }],
    });

    const anthropic = createAnthropicClient("key", client);

    await expect(anthropic.complete("prompt", SCHEMA)).rejects.toThrow(
      /truncat/i,
    );
  });

  test("passes model, max_tokens, schema, fallbacks and the beta header to create", async () => {
    const { client, create } = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "{}" }],
    });

    const anthropic = createAnthropicClient("key", client);
    await anthropic.complete("the prompt", SCHEMA);

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.max_tokens).toBe(16000);
    expect(params.output_config.format).toEqual({
      type: "json_schema",
      schema: SCHEMA,
    });
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toContain(REFUSAL_FALLBACK_BETA);
    expect(params.messages).toEqual([{ role: "user", content: "the prompt" }]);
  });

  test("makes no network calls — everything goes through the injected client", async () => {
    const { client, create } = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "{}" }],
    });

    const anthropic = createAnthropicClient("key", client);
    await anthropic.complete("x", SCHEMA);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
