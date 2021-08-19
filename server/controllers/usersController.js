const usersModel = require("../models/usersModel");
const uuid = require("uuid");
const fs = require("fs");
//for Prisma
const { PrismaClient } = require("@prisma/client");
const { user, noSensitivity, yesSensitivity, products } = new PrismaClient();
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
// function addNoSensitivity(req, res) {
//   const users = usersModel.getUser();
//   console.log(users);
//   const singleUser = users.find((user) => req.params.userID === user.id);
//   console.log(singleUser);

//   singleUser.no_sensitivity.push(req.body);
//   console.log(singleUser);
//   console.log(users);
//   fs.writeFileSync("./data/users.json", JSON.stringify(users));
//   //TODO try this usersModel.setUser(users);
//   res.status(201).json(req.body);
// }
/////test Add product to a user's noSensitivity list ///
async function addNotSensitiveTo(req, res) {
  console.log(req.body);
  const { id, brandName, productName, ingredients, image, userId } = req.body;

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

      // add/connect this product to this user
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
    },
  });
  console.log(addProduct);
  res.json(addProduct);
}

//DB - User adds a product they are sensitive to to the yesSensitivity list. If it already exsits it won't be added to their list.
async function addSensitiveTo(req, res) {
  console.log(req.body);
  const { id, userId, brandName, productName, ingredients, image } = req.body;
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
  const returnProduct = req.body;
  //
  const productAlreadyExists = await yesSensitivity.findFirst({
    where: {
      products: {
        some: { id: id },
      },
    },
  });
  console.log(productAlreadyExists);
  if (!productAlreadyExists) {
    const addProduct = await yesSensitivity.create({
      data: {
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
      },
    });
    res.status(201).json(returnProduct);
  } else {
    return res.json({
      msg: "product already exsits on this list",
    });
  }
}
module.exports = {
  getUsers,
  getSingleUser,
  // addNoSensitivity,
  addSensitiveTo,
  addNotSensitiveTo,
};
