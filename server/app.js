require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const productsRoutes = require("./routes/products");
const usersRoutes = require("./routes/users");

const app = express();

// Fail fast rather than signing tokens with `undefined`, which would make every
// token forgeable.
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Generate one with:\n" +
      `  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  );
}

// Previously `cors()` -- open to every origin on the internet.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser callers (curl, health checks) which send
      // no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed: ${origin}`));
    },
  })
);

app.use(express.json({ limit: "100kb" }));

app.use("/images", express.static(path.join(__dirname, "public/images")));

app.use("/products", productsRoutes);
app.use("/users", usersRoutes);

// Central error handler. Without this, thrown errors leak stack traces.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && /Origin not allowed/.test(err.message)) {
    return res.status(403).json({ msg: "Origin not allowed." });
  }
  console.error(err);
  return res.status(500).json({ msg: "Internal server error." });
});

module.exports = app;
