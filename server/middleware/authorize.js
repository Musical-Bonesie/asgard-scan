const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    // read the authorization header in the request and parse the token
    // if there's no token, return a 403
    // otherwise, use jwt.verify to verify our token against the secret
    // if the secret is legit, slip the email in our request as req.user and move on
    // if verify fails, return a 401 Authentication Failed
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(403).json({ message: "Unauthorized." });
    }
    if (jwt.verify(token, process.env.JWT_SECRET)) {
      req.decode = jwt.decode(token);

      // These are the droids we're looking for. Slip the username
      // inside our request and go on our merry way.
      req.username = req.decode.username;
      req.username = req.params.username;
      next();
    }
  } catch (error) {
    res.status(401).json({ message: "Authentication failed!" });
  }
};
