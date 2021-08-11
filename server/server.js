const express = require("express");
const app = express();
const cors = require("cors");
const productsRoutes = require("./routes/products");

app.use(cors());

app.use(express.json());

//configuration
require("dotenv").config();
const PORT = process.env.PORT || 8080;

//ROUTES
app.use("/products", productsRoutes);

//PORT
app.listen(PORT, () => {
  console.log(`Server is now running on port ${PORT}`);
});
