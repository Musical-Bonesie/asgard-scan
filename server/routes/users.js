const express = require("express");
const app = express();
const usersController = require("../controllers/usersController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");
const jwt = require("jsonwebtoken"); //jwt libary installed
const bcrypt = require("bcryptjs"); // means within server directory ablity to encrypt passwords
const authorize = require("../middleware/authorize"); // middleware to check there is an authroization header sent
//TODO delete line 9 and 10 and make sure it's inside the userController
const { PrismaClient } = require("@prisma/client");
const { user } = new PrismaClient();

///.get all users is via prisma
router.get("/", usersController.getUsers);
///////
router.get("/:id", usersController.getSingleUser);

//POST Add a user remeber to add userAuth //TODO change this to add more user info
router.post("/", async (req, res) => {
  console.log(req.body);
  const { username } = req.body;
  // if (username == null) {
  //   res.status(500).send("username undefined");
  // } else {
  //check to see if user already exsits
  const userExists = await user.findUnique({
    where: { username },
    select: {
      username: true,
    },
  });
  if (userExists) {
    return res.status(400).json({
      msg: "user already exists",
    });
  }
  //Create a new user
  const newUser = await user.create({
    data: {
      username: req.body.username,
      password: req.body.password,
      //TODO token          String
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
    },
  });
  res.json(newUser);
});

//PATCH
//user adds a product that they are NOT sensitive to:
// router.patch("/:userID", usersController.addNoSensitivity);
//DB route on 56
router.patch("/:userID", usersController.addNotSensitiveTo);

//user adds product that they ARE sensitive to:
//db route on 60:
router.patch("/sensitive/:userID", usersController.addSensitiveTo);

module.exports = router;
