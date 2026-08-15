const jwt = require("jsonwebtoken");

/**
 * Verifies the caller's bearer token and attaches the authenticated identity
 * to `req.user`.
 *
 * Downstream handlers MUST authorize against `req.user` rather than trusting a
 * `:username` URL parameter -- that param is attacker-controlled.
 */
module.exports = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ msg: "Authentication required." });
  }

  // Expect exactly "Bearer <token>". Split on whitespace, not on "".
  const [scheme, token, ...rest] = header.trim().split(/\s+/);

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token || rest.length) {
    return res.status(401).json({ msg: "Malformed Authorization header." });
  }

  try {
    // Throwing form rather than the callback form: the callback made it easy to
    // fall through to the handler after already responding. Fail closed.
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, username: payload.username };
    return next();
  } catch (err) {
    // Covers bad signature, malformed token, and expiry alike. Deliberately
    // does not leak which one failed.
    return res.status(401).json({ msg: "Invalid or expired token." });
  }
};
