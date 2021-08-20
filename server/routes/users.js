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
router.post("/login", async (req, res) => {
  console.log(req.body);
  const { username } = req.body;
  const token = jwt.sign({ user: username }, "Nonsesense");
  // if (username == null) {
  //   res.status(500).send("username undefined");
  // } else {
  //check to see if user already exsits
  const userExists = await user.findUnique({
    where: { username },
    select: {
      username: true,
      password: true,
    },
  });
  if (userExists) {
    return res.status(400).json({
      msg: "user already exists",
    });
  }
  //Create a new user
  // const newUser = await user.create({
  //   data: {
  //     username: req.body.username,
  //     password: req.body.password,
  //     //TODO token          String
  //     firstName: req.body.firstName,
  //     lastName: req.body.lastName,
  //     email: req.body.email,
  //   },
  // });
  res.json(token);
});
////////test above that isn't finished for user auth//////
router.post("/signup", async (req, res) => {
  const { username, password, firstName, lastName, email } = req.body;
  // TODO figure our how to password protect bcrypt.hash(password, 8).then(hasedPassword);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: "24",
  });

  const userExists = await user.findUnique({
    where: { username },
    select: {
      username: true,
      password: true,
    },
  });
  if (userExists) {
    return res.status(400).json({
      msg: "user already exists",
    });
  }
  // Create a new user
  const newUser = await user.create({
    data: {
      username: username,
      password: password,
      token: token,
      firstName: firstName,
      lastName: lastName,
      email: email,
    },
  });
  res.status(201).send.json(newUser);
});
/////TEST above user sign up /////

//PATCH
//user adds a product to noSensitive list in DB that they are NOT sensitive to:
router.patch("/:username", usersController.addNotSensitiveTo);

//user adds a product to yesSensitive DB list:
router.patch("/sensitive/:username", usersController.addSensitiveTo);

module.exports = router;
