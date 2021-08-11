const fs = require("fs");

const getProducts = () => JSON.parse(fs.readFileSync("./data/products.json"));

module.exports = { getProducts };
