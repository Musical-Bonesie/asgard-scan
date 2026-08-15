const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const SECRET = "test-secret-value-for-integration-tests";

// Prisma is mocked so these tests need no database.
jest.mock("@prisma/client", () => {
  const models = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    noSensitivity: { findFirst: jest.fn(), create: jest.fn() },
    yesSensitivity: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    products: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => models), __models: models };
});

const { __models: db } = require("@prisma/client");

process.env.JWT_SECRET = SECRET;
process.env.CORS_ORIGINS = "http://localhost:3000";

const app = require("../app");

const PASSWORD = "correct-horse-battery";
const EXISTING_USER = {
  id: 42,
  username: "signe",
  password: bcrypt.hashSync(PASSWORD, 10),
  firstName: "Signe",
  lastName: "B",
  email: "signe@example.com",
};

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, {
    expiresIn: "1h",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /users/login", () => {
  test("unknown username returns 401 without crashing", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/users/login")
      .send({ username: "nobody", password: "whatever" });

    // Originally this dereferenced `currentUser.password` on null -> 500.
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test("wrong password returns 401 and issues no token", async () => {
    db.user.findUnique.mockResolvedValue(EXISTING_USER);

    const res = await request(app)
      .post("/users/login")
      .send({ username: "signe", password: "wrong-password" });

    // Originally the token was signed BEFORE the password check, and the
    // failure branches lacked `return`, so a token could still be sent.
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test("does not reveal whether the username or the password was wrong", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const unknownUser = await request(app)
      .post("/users/login")
      .send({ username: "nobody", password: "whatever" });

    db.user.findUnique.mockResolvedValue(EXISTING_USER);
    const badPassword = await request(app)
      .post("/users/login")
      .send({ username: "signe", password: "wrong-password" });

    expect(unknownUser.body).toEqual(badPassword.body);
  });

  test("valid credentials return a token bound to the real user", async () => {
    db.user.findUnique.mockResolvedValue(EXISTING_USER);

    const res = await request(app)
      .post("/users/login")
      .send({ username: "signe", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");

    // The original signed `{ id: user.id }` where `user` was the Prisma model
    // delegate, producing an empty payload on every token ever issued.
    const payload = jwt.verify(res.body.token, SECRET);
    expect(payload.id).toBe(42);
    expect(payload.username).toBe("signe");
  });

  test("issued tokens expire in about an hour, not ~41 days", async () => {
    db.user.findUnique.mockResolvedValue(EXISTING_USER);

    const res = await request(app)
      .post("/users/login")
      .send({ username: "signe", password: PASSWORD });

    const payload = jwt.verify(res.body.token, SECRET);
    const lifetimeSeconds = payload.exp - payload.iat;
    expect(lifetimeSeconds).toBeLessThanOrEqual(60 * 60);
  });

  test("never returns the password hash", async () => {
    db.user.findUnique.mockResolvedValue(EXISTING_USER);

    const res = await request(app)
      .post("/users/login")
      .send({ username: "signe", password: PASSWORD });

    expect(JSON.stringify(res.body)).not.toContain(EXISTING_USER.password);
  });
});

describe("GET /users", () => {
  test("the unauthenticated dump-every-user endpoint is gone", async () => {
    const res = await request(app).get("/users");

    // Previously returned every user plus their skin-sensitivity records.
    expect(res.status).toBe(404);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /users/:username", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/users/signe");
    expect(res.status).toBe(401);
  });

  test("refuses to read another user's profile", async () => {
    const res = await request(app)
      .get("/users/someone-else")
      .set("Authorization", `Bearer ${tokenFor(EXISTING_USER)}`);

    expect(res.status).toBe(403);
  });

  test("returns your own profile without the password", async () => {
    db.user.findUnique.mockResolvedValue({
      id: 42,
      username: "signe",
      firstName: "Signe",
      lastName: "B",
      email: "signe@example.com",
      noSensitivity: [],
      yesSensitivity: [],
    });

    const res = await request(app)
      .get("/users/signe")
      .set("Authorization", `Bearer ${tokenFor(EXISTING_USER)}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("signe");
    expect(res.body.password).toBeUndefined();
  });
});

describe("ownership enforcement on mutating routes", () => {
  const product = {
    id: 1,
    brandName: "B",
    productName: "P",
    ingredients: "water",
    image: "i.png",
  };

  test("PATCH /users/:username requires a token", async () => {
    const res = await request(app).patch("/users/signe").send(product);
    expect(res.status).toBe(401);
  });

  test("PATCH /users/:username rejects acting on another user", async () => {
    const res = await request(app)
      .patch("/users/victim")
      .set("Authorization", `Bearer ${tokenFor(EXISTING_USER)}`)
      .send(product);

    // The username came straight from the URL with no ownership check.
    expect(res.status).toBe(403);
    expect(db.noSensitivity.create).not.toHaveBeenCalled();
  });

  test("PATCH /users/sensitive/:username rejects acting on another user", async () => {
    const res = await request(app)
      .patch("/users/sensitive/victim")
      .set("Authorization", `Bearer ${tokenFor(EXISTING_USER)}`)
      .send(product);

    expect(res.status).toBe(403);
    expect(db.yesSensitivity.create).not.toHaveBeenCalled();
  });

  test("DELETE requires a token", async () => {
    const res = await request(app).delete("/users/sensitive/1");
    expect(res.status).toBe(401);
  });

  test("DELETE only removes records owned by the caller", async () => {
    db.yesSensitivity.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .delete("/users/sensitive/999")
      .set("Authorization", `Bearer ${tokenFor(EXISTING_USER)}`);

    // Originally: delete({ where: { id: username } }) straight from the URL,
    // unauthenticated, with no ownership scoping at all.
    expect(res.status).toBe(404);
    expect(db.yesSensitivity.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 42 }),
      })
    );
  });
});

describe("POST /users/signup", () => {
  test("stores a bcrypt hash, never the plaintext password", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 7, ...data })
    );

    const res = await request(app).post("/users/signup").send({
      username: "newbie",
      password: "a-long-enough-password",
      firstName: "New",
      lastName: "Bie",
      email: "new@example.com",
    });

    expect(res.status).toBe(201);

    const saved = db.user.create.mock.calls[0][0].data;
    expect(saved.password).not.toBe("a-long-enough-password");
    expect(saved.password).toMatch(/^\$2[aby]\$/);

    // Cost factor must be >= 12; the original used 8.
    const cost = parseInt(saved.password.split("$")[2], 10);
    expect(cost).toBeGreaterThanOrEqual(12);
  });

  test("does not persist the JWT on the user record", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 7, ...data })
    );

    await request(app).post("/users/signup").send({
      username: "newbie",
      password: "a-long-enough-password",
      firstName: "New",
      lastName: "Bie",
      email: "new@example.com",
    });

    const saved = db.user.create.mock.calls[0][0].data;
    expect(saved.token).toBeUndefined();
  });

  test("rejects a duplicate username", async () => {
    db.user.findUnique.mockResolvedValue(EXISTING_USER);

    const res = await request(app).post("/users/signup").send({
      username: "signe",
      password: "a-long-enough-password",
      firstName: "S",
      lastName: "B",
      email: "dup@example.com",
    });

    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  test("rejects a short password", async () => {
    const res = await request(app).post("/users/signup").send({
      username: "shorty",
      password: "abc",
      firstName: "S",
      lastName: "B",
      email: "short@example.com",
    });

    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
