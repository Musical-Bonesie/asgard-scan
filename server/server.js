const express = require("express");
const app = express();
const cors = require("cors");
const productsRoutes = require("./routes/products");
const usersRoutes = require("./routes/users");
const jwt = require("jsonwebtoken");

app.use(cors());
app.use(express.static("public/images"));

//helps avoid issues with reading the req body.
app.use(express.json());

//configuration
require("dotenv").config();
const PORT = process.env.PORT || 8080;

//ROUTES
app.use("/products", productsRoutes);
app.use("/users", usersRoutes);

////User Login
//delete
const users = {};
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  const token = jwt.sign({ user: username }, "Nonsesense");
  //checking to  make sure password matches user. If it doesn't we return status of 401
  if (user && user.password === password) {
    // Create a JWT token for the user, and add their name to
    // the token. Send the token back to the client.
  }
  res.status(201).json(token);
});

//PORT Listening on..
app.listen(PORT, () => {
  console.log(`Server is now running on port ${PORT}`);
});
