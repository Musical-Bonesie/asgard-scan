import { beforeEach, describe, expect, test } from "vitest";
import * as api from "./dataUtils";

describe("API surface", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("no longer exposes a fetch-every-user helper", () => {
    // GET /users returned every user in the database, plus their
    // skin-sensitivity records, to unauthenticated callers. It is gone from
    // both the API and this client.
    expect(api.getUser).toBeUndefined();
  });

  test("exposes the endpoints the app actually uses", () => {
    for (const name of [
      "getProducts",
      "loginUser",
      "signUpNewUser",
      "getSingleUser",
      "addNotSensitiveProduct",
      "addSensitiveToProduct",
      "deleteProductSensitiveTo",
    ]) {
      expect(typeof api[name]).toBe("function");
    }
  });

  test("getSingleUser takes only a username; the token is attached automatically", () => {
    // Callers used to have to pass the token by hand, and most forgot -- which
    // is why the mutating endpoints were being called unauthenticated.
    expect(api.getSingleUser.length).toBe(1);
  });

  test("deleteProductSensitiveTo takes a record id, not a username", () => {
    expect(api.deleteProductSensitiveTo.length).toBe(1);
  });
});
