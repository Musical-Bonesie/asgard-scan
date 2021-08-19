const usersModel = require("../models/usersModel");
const uuid = require("uuid");
const fs = require("fs");
//for Prisma
const { PrismaClient } = require("@prisma/client");
const { user, noSensitivity } = new PrismaClient();
//GET user info
async function getUsers(req, res) {
  // const users = usersModel.getUser();
  // res.status(200).json(users)
  const users = await user.findMany({
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      noSensitivity: true,
      yesSensitivity: true,
    },
  });
  res.json(users);
}

function getSingleUser(req, res) {
  const users = usersModel.getUser();
  const singleUser = users.find((user) => user.id === req.params.id);
  res.status(200).json(singleUser);
}
//Add or Patch products to a user
//TODO add to the no_sensitivity list/Yes Products figure out why this isnt't working..
function addNoSensitivity(req, res) {
  const users = usersModel.getUser();
  console.log(users);
  const singleUser = users.find((user) => req.params.userID === user.id);
  console.log(singleUser);

  singleUser.no_sensitivity.push(req.body);
  console.log(singleUser);
  console.log(users);
  fs.writeFileSync("./data/users.json", JSON.stringify(users));
  //TODO try this usersModel.setUser(users);
  res.status(201).json(req.body);
}
/////test///
async function addNotSensitiveTo(req, res) {
  console.log(req.body);
  const {
    id,
    brandName,
    productName,
    ingredients,
    image,
    userId,
    price,
    category,
    status,
  } = req.body;

  const userExists = await user.findUnique({
    where: {
      id: userId,
    },
  });
  if (!userExists) {
    return res.status(400).json({
      msg: "user not found",
    });
  }
  console.log(userExists);

  const addProduct = await noSensitivity.create({
    data: {
      // id: req.body.id,
      brandName,
      productName,
      ingredients,
      image,
      price,
      category,
      status,
      user: {
        connect: {
          id: userId,
        },
      },
      products: {
        connect: {
          id: id,
        },
      },
      // userId: req.body.userId,
    },
  });
  console.log(addProduct);
  res.json(addProduct);
}
////test///

//user can add products they ARE sensitive to:
function addSensitiveTo(req, res) {
  const users = usersModel.getUser();
  console.log(users);
  const singleUser = users.find((user) => req.params.userID === user.id);
  console.log(singleUser);

  singleUser.yes_sensitivity.push(req.body);
  console.log(singleUser);
  console.log(users);
  fs.writeFileSync("./data/users.json", JSON.stringify(users));
  //TODO try this usersModel.setUser(users);
  res.status(201).json(req.body);
}

module.exports = {
  getUsers,
  getSingleUser,
  addNoSensitivity,
  addSensitiveTo,
  addNotSensitiveTo,
};
