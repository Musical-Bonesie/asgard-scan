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

///GET all users from DB
router.get("/", usersController.getUsers);
//GET single user from DB
router.get("/:username", usersController.getSingleUser);

//Create user test to DB below////
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
/////TEST above /////

//PATCH
//user adds a product to noSensitive list in DB that they are NOT sensitive to:
router.patch("/:username", usersController.addNotSensitiveTo);

//user adds a product to yesSensitive DB list:
router.patch("/sensitive/:username", usersController.addSensitiveTo);

module.exports = router;
