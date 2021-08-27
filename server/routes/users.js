const usersController = require("../controllers/usersController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");
//TODO delete line 9 and 10 and make sure it's inside the userController
const { PrismaClient } = require("@prisma/client");
const { user } = new PrismaClient();
const { check, validationResult } = require("express-validator");
const authorize = require("../middleware/authorize");

///GET all users from DB
router.get("/", usersController.getUsers);
///GET single user from DB
router.get("/:username", usersController.getSingleUser);
//OG Abovetest below
// router.get("/:username", authorize, usersController.getSingleUser);

///POST
//User Login
router.post(
  "/login",
  [check("username", "invalid username")],
  usersController.userLogin
);

//New User Sign up
router.post(
  "/signup",
  [
    check("email", "Please provide a valid email").isEmail(),
    check(
      "password",
      "Please create a password with more than 5 characters"
    ).isLength({
      min: 6,
    }),
  ],
  usersController.createNewUser
);

///PATCH
//user adds a product to noSensitive list in DB that they are NOT sensitive to:
router.patch("/:username", usersController.addNotSensitiveTo);

//user adds a product to yesSensitive DB list:
router.patch("/sensitive/:username", usersController.addSensitiveTo);

///DELETE user can delete a product from their yesSensitive list.
router.delete("/sensitive/:username", usersController.deleteProductSensitiveTo);

module.exports = router;
