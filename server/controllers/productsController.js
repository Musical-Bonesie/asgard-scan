// const productsModel = require("../models/productModel");
// import YesSensitivity from "../../client/src/components/YesSensitivity/YesSensitivity";
const uuid = require("uuid");
const { PrismaClient } = require("@prisma/client");
const { products } = new PrismaClient();

async function getProducts(req, res) {
  const product = await products.findMany({
    select: {
      id: true,
      brandName: true,
      productName: true,
      ingredients: true,
      category: true,
      status: true,
      image: true,
      noSensitivity: true,
      yesSensitivity: true,
    },
  });
  res.json(product);
}

module.exports = { getProducts };
