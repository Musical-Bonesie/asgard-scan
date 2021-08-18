const express = require("express");
const app = express();
const usersController = require("../controllers/usersController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");
const jwt = require("jsonwebtoken"); //jwt libary installed
const bcrypt = require("bcryptjs"); // means within server directory ablity to encrypt passwords
const authorize = require("../middleware/authorize"); // middleware to check there is an authroization header sent
//delete line 9 and 10 and make sure it's inside the userController
const { PrismaClient } = require("@prisma/client");
const { user } = new PrismaClient();

///.get all users is via prisma
router.get("/", usersController.getUsers);
router.get("/:id", usersController.getSingleUser);

//POST Add a user remeber to add Auser Auth //TODO change this to add more user info
router.post("/", async (req, res) => {
  console.log(req.body);
  const { username } = req.body;
  if (username == null) {
    res.status(500).send("username undefined");
  } else {
    //check to see if user already exsits
    const userExists = await user.findUnique({
      where: { username },
      select: {
        username: true,
      },
    });
    res.json(userExists);
  }
});

//PATCH
//user adds a product that they are NOT sensitive to:
router.patch("/:userID", usersController.addNoSensitivity);
//user adds product that they ARE sensitive to:
router.patch("/sensitive/:userID", usersController.addSensitiveTo);

module.exports = router;
