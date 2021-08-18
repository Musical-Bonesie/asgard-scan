const usersController = require("../controllers/usersController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");
const jwt = require("jsonwebtoken"); //jwt libary installed
const bcrypt = require("bcryptjs"); // means within server directory ablity to encrypt passwords
const authorize = require("../middleware/authorize"); // middleware to check there is an authroization header sent

///.get all users is via prisma
router.get("/", usersController.getUsers);
router.get("/:id", usersController.getSingleUser);
//PATCH
//user adds a product that they are NOT sensitive to:
router.patch("/:userID", usersController.addNoSensitivity);
//user adds product that they ARE sensitive to:
router.patch("/sensitive/:userID", usersController.addSensitiveTo);

module.exports = router;
