const productsController = require("../controllers/productsController");
const router = require("express").Router();

//GET
router.get("/", productsController.getProducts);

module.exports = router;
