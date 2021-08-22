const productsController = require("../controllers/productsController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");

//GET
router.get("/", productsController.getProducts);

module.exports = router;
