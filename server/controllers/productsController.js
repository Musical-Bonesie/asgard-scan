const productsModel = require("../models/productModel");
const uuid = require("uuid");

function getProducts(req, res) {
  const products = productsModel.getProducts();
  res.status(200).json(products);
}

module.exports = { getProducts };
