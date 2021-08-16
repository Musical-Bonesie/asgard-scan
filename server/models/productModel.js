const fs = require("fs");

const getProducts = () => JSON.parse(fs.readFileSync("./data/products.json"));
const addProducts = (products) =>
  fs.writeFileSync(`./data.products.json`, JSON.stringify(products));

module.exports = { getProducts, addProducts };
