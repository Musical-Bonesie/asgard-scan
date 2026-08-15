const router = require("express").Router();
const productsController = require("../controllers/productsController");

// The product catalogue is public, non-personal reference data.
router.get("/", productsController.getProducts);

module.exports = router;
