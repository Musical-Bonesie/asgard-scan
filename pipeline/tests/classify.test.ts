import { describe, expect, test, vi } from "vitest";
import { classifyDescription, CLASSIFY_SCHEMA } from "../src/classify";
import type { ClassifierClient } from "../src/classify";

function fakeClient(payload: unknown): ClassifierClient {
  return {
    complete: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  };
}

describe("classifyDescription", () => {
  test("returns the parsed classification", async () => {
    const client = fakeClient({
      classification: "full_list",
      reasoning: "Labelled 'Ingredients:' followed by an INCI list",
      confidence: 0.95,
    });

    const result = await classifyDescription(client, "Ingredients: Aqua, Glycerin");

    expect(result.classification).toBe("full_list");
    expect(result.confidence).toBe(0.95);
  });

  test("passes the description to the model", async () => {
    const client = fakeClient({
      classification: "none",
      reasoning: "no ingredient data",
      confidence: 0.9,
    });

    await classifyDescription(client, "A lovely moisturiser.");

    expect(client.complete).toHaveBeenCalledWith(
      expect.stringContaining("A lovely moisturiser."),
      CLASSIFY_SCHEMA,
    );
  });

  test("rejects a classification outside the allowed set", async () => {
    const client = fakeClient({
      classification: "banana",
      reasoning: "",
      confidence: 0.9,
    });

    await expect(classifyDescription(client, "x")).rejects.toThrow(
      /invalid classification/i,
    );
  });

  test("rejects a confidence outside 0..1", async () => {
    const client = fakeClient({
      classification: "full_list",
      reasoning: "",
      confidence: 4,
    });

    await expect(classifyDescription(client, "x")).rejects.toThrow(
      /confidence/i,
    );
  });

  test("prompt instructs choosing full_list when a highlights section co-occurs with a complete list", async () => {
    const client = fakeClient({
      classification: "full_list",
      reasoning: "",
      confidence: 0.9,
    });

    await classifyDescription(client, "x");

    const prompt = (client.complete as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;

    // Real assertion on the co-occurrence guidance: the prompt must tell the
    // model what to do when BOTH a highlights/"Key Ingredients" section AND a
    // separate complete ingredient list are present in the same description.
    expect(prompt).toMatch(/key ingredients/i);
    expect(prompt).toMatch(/complete (?:ingredient )?list/i);
    expect(prompt).toMatch(/full_list/);
    expect(prompt).toMatch(/(?:also|both|as well as|in addition)/i);
  });
});
