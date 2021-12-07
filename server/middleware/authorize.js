const jwt = require("jsonwebtoken");
//this verifies
// module.exports = (req, res, next) => {
//   //Check to see Authorize Header. It isn't sent in the body but the header
//   if (!req.headers.aithorization) {
//     return res.status(401).send("Please login.");
//   }
//   //now we verify that the jwt is valid. When this info is sent it's going to be a string that starts with 1Bearer along with the web token. But we don't want the word Bearer included it will mess up our jwt
//   //so we use .split() to sperate Bearer from the actual jwt so it doens't mess up our req and our auith toaken will be [1] in the array we created using .split(')
//   const authToken = req.headers.authorization.split("")[1];
//   jwt.verify(authToken, process.env.JWT_SECRET, (err, decoded) => {
//     if (err) {
//       return res.status(401).send("Invald Auth Token.");
//     }
//     //decoded is something that jwt gives us to work with. by setting decoded to req.decoded so we have access to the decoded jwt payload. if you don't decode it might cause an error from users if you don't define it here.
//     req.decoded = decoded;
//     next();
//   });
// };
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
      return res.status(403).json({ message: "No token. Unauthorized." });
    }
    if (jwt.verify(token, process.env.JWT_SECRET)) {
      req.decode = jwt.decode(token);
      // These are the droids we're looking for. Slip the email address
      // inside our request and go on our merry way.
      req.user = req.decode.username;
      next();
    }
  } catch (error) {
    res.status(401).json({ message: "Authentication failed!" });
  }
};
