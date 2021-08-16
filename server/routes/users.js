const usersController = require("../controllers/usersController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");

//GET
router.get("/", usersController.getUser);

//POST
//add a yes product to user's yes_product list
router.post("/yesproducts/:userID", usersController.addYesProduct);

module.exports = router;
