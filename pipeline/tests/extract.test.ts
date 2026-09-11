import { describe, expect, test, vi } from "vitest";
import { extractIngredients } from "../src/extract";
import type { ClassifierClient } from "../src/classify";

function fakeClient(payload: unknown): ClassifierClient {
  return { complete: vi.fn().mockResolvedValue(JSON.stringify(payload)) };
}

describe("extractIngredients", () => {
  test("returns ingredients in description order", async () => {
    const client = fakeClient({
      ingredients: [
        { raw: "Aqua", canonical: "Aqua", position: 0 },
        { raw: "Glycerin", canonical: "Glycerin", position: 1 },
      ],
      confidence: 0.95,
      notes: "",
    });

    const result = await extractIngredients(
      client,
      "Ingredients: Aqua, Glycerin",
      "full_list",
    );

    expect(result.ingredients.map((i) => i.canonical)).toEqual([
      "Aqua",
      "Glycerin",
    ]);
  });

  test("returns nothing for a description with no ingredient data", async () => {
    const client = fakeClient({ ingredients: [], confidence: 1, notes: "" });

    const result = await extractIngredients(client, "Lovely.", "none");

    expect(result.ingredients).toEqual([]);
    // No model call should be made for "none" — it is already decided.
    expect(client.complete).not.toHaveBeenCalled();
  });

  test("repairs out-of-order positions rather than trusting the model", async () => {
    // Order carries concentration meaning, so it must be correct even if the
    // model emits positions inconsistently.
    const client = fakeClient({
      ingredients: [
        { raw: "Glycerin", canonical: "Glycerin", position: 5 },
        { raw: "Aqua", canonical: "Aqua", position: 2 },
      ],
      confidence: 0.9,
      notes: "",
    });

    const result = await extractIngredients(client, "x", "full_list");

    expect(result.ingredients.map((i) => i.position)).toEqual([0, 1]);
    expect(result.ingredients.map((i) => i.canonical)).toEqual([
      "Glycerin",
      "Aqua",
    ]);
  });

  test("tells the model to put actives first for a split list", async () => {
    const client = fakeClient({ ingredients: [], confidence: 0.9, notes: "" });

    await extractIngredients(client, "x", "active_inactive");

    const prompt = (client.complete as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(prompt).toMatch(/actives first/i);
  });
});
