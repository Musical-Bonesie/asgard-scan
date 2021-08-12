const usersController = require("../controllers/usersController");
const router = require("express").Router();

//GET
router.get("/", usersController.getUser);

module.exports = router;
