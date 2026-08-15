const jwt = require("jsonwebtoken");
const authorize = require("./authorize");

const SECRET = "test-secret-value-for-unit-tests-only";

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

/** Minimal express-ish res double that records what was sent. */
function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("authorize middleware", () => {
  test("rejects a request with no Authorization header (401, not a crash)", () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    // Must not throw. The original implementation checked a misspelled
    // `aithorization` key, fell through, and then threw a TypeError on
    // `undefined.split(...)` -- surfacing as a 500.
    expect(() => authorize(req, res, next)).not.toThrow();

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects when the header is present but not a Bearer scheme", () => {
    const req = { headers: { authorization: "Basic dXNlcjpwYXNz" } };
    const res = mockRes();
    const next = jest.fn();

    authorize(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects when the Bearer token is missing after the scheme", () => {
    const req = { headers: { authorization: "Bearer " } };
    const res = mockRes();
    const next = jest.fn();

    authorize(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects a token signed with the wrong secret", () => {
    const forged = jwt.sign({ id: 1, username: "mallory" }, "not-the-secret");
    const req = { headers: { authorization: `Bearer ${forged}` } };
    const res = mockRes();
    const next = jest.fn();

    authorize(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects an expired token", () => {
    const expired = jwt.sign({ id: 1, username: "demo" }, SECRET, {
      expiresIn: -10,
    });
    const req = { headers: { authorization: `Bearer ${expired}` } };
    const res = mockRes();
    const next = jest.fn();

    authorize(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("accepts a valid token and exposes the real user identity", () => {
    const token = jwt.sign({ id: 42, username: "signe" }, SECRET, {
      expiresIn: "1h",
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authorize(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
    // The whole point of the fix: a usable identity must reach the handlers,
    // so routes can enforce ownership instead of trusting a URL param.
    expect(req.user).toEqual(
      expect.objectContaining({ id: 42, username: "signe" })
    );
  });

  test("parses the token exactly, not character-by-character", () => {
    // Regression guard for `.split("")[1]`, which sliced the header into
    // single characters and used the letter "e" as the token.
    const token = jwt.sign({ id: 7, username: "edge" }, SECRET, {
      expiresIn: "1h",
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authorize(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(7);
  });

  test("is case-insensitive about the Bearer scheme", () => {
    const token = jwt.sign({ id: 3, username: "case" }, SECRET, {
      expiresIn: "1h",
    });
    const req = { headers: { authorization: `bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authorize(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(3);
  });
});
