const jwt = require("jsonwebtoken");
//this verifies
module.exports = (req, res, next) => {
  //Check to see Authorize Header. It isn't sent in the body but the header
  if (!req.headers.aithorization) {
    return res.status(401).send("Please login.");
  }
  //now we verify that the jwt is valid. When this info is sent it's going to be a string that starts with 1Bearer along with the web token. But we don't want the word Bearer included it will mess up our jwt
  //so we use .split() to sperate Bearer from the actual jwt so it doens't mess up our req and our auith toaken will be [1] in the array we created using .split(')
  const authToken = req.headers.authorization.split("")[1];
  jwt.verify(authToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send("invald Auth Token.");
    }
    //decoded is something that jwt gives us to work with. by setting decoded to req.decoded so we have access to the decoded jwt payload. if you don't decode it might cause an error from users if you don't define it here.
    req.decoded = decoded;
    next();
  });
};
