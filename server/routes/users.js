const usersController = require("../controllers/usersController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");

//GET
router.get("/", usersController.getUser);

//PATCH
//user adds a product that they are NOT sensitive to:
router.patch("/notsensitive/:userID", usersController.addNoSensitivity);

module.exports = router;
