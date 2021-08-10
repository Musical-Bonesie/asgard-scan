const express = require("express");
const app = express();
const cors = require("cors");

app.use(cors());

app.use(express.json());

//configuration
require("dotenv").config();
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server is now running on port ${PORT}`);
});
