const usersModel = require("../models/usersModel");
const uuid = require("uuid");
const fs = require("fs");
//for Prisma
const { PrismaClient } = require("@prisma/client");
const { user, noSensitivity, yesSensitivity, products } = new PrismaClient();

//GET all user:
async function getUsers(req, res) {
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
//Get a single user:
async function getSingleUser(req, res) {
  const { id } = req.body;
  const singleUser = await user.findUnique({
    where: {
      id: id,
    },
  });
  res.status(200).json(singleUser);
}
// User adds a product that they are NOT sensitive to the No Sensitivity list. If it already exists, it won't be added.
async function addNotSensitiveTo(req, res) {
  const {
    id,
    brandName,
    productName,
    ingredients,
    image,
    price,
    category,
    status,
    userId,
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
  const productAlreadyExists = await noSensitivity.findFirst({
    where: {
      products: {
        some: { id: id },
      },
    },
  });
  if (!productAlreadyExists) {
    const addProduct = await noSensitivity.create({
      data: {
        brandName,
        productName,
        ingredients,
        image,
        price,
        category,
        status,
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
    res.json(addProduct);
  } else {
    return res.json({
      msg: "product already exsits on this list",
    });
  }
}

//DB - User adds a product they are sensitive to to the yesSensitivity list. If it already exsits it won't be added to their list.
async function addSensitiveTo(req, res) {
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

  const returnProduct = req.body;
  //
  const productAlreadyExists = await yesSensitivity.findFirst({
    where: {
      products: {
        some: { id: id },
      },
    },
  });

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
    //TODO try adding addProduct as a second param .json(returnProduct, addProduct);
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
  addSensitiveTo,
  addNotSensitiveTo,
};
