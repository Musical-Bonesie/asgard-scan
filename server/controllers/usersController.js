const usersModel = require("../models/usersModel");

//User info validation, token creating and password encryption:
const { check, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
///auth file -- might not be using:
const authorize = require("../middleware/authorize");
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
  const { username } = req.params;
  const singleUser = await user.findUnique({
    where: {
      username: username,
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      noSensitivity: true,
      yesSensitivity: true,
    },
  });
  res.status(200).json(singleUser);
}
// User adds a product that they are NOT sensitive to the No Sensitivity list. If it already exists, it won't be added.
async function addNotSensitiveTo(req, res) {
  const { id, brandName, productName, ingredients, image } = req.body;
  const { username } = req.params;
  const userExists = await user.findUnique({
    where: {
      username: username,
    },
  });
  if (!userExists) {
    return res.status(404).json({
      msg: "user not found",
    });
  }
  const productAlreadyExists = await noSensitivity.findFirst({
    where: {
      userId: userExists.id,
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

        // add/connect this product to this user
        user: {
          connect: {
            username: username,
          },
        },
        products: {
          connect: {
            id: id,
          },
        },
      },
    });
    res.status(200).json(addProduct);
  } else {
    return res.status(202).json({
      msg: "product already exsits on this list",
    });
  }
}

//DB - User adds a product they are sensitive to to the yesSensitivity list. If it already exsits it won't be added to their list.
async function addSensitiveTo(req, res) {
  const { id, brandName, productName, ingredients, image } = req.body;
  const { username } = req.params;
  const userExists = await user.findUnique({
    where: {
      username: username,
    },
  });
  if (!userExists) {
    return res.status(404).json({
      msg: "user not found",
    });
  }

  //
  const productAlreadyExists = await yesSensitivity.findFirst({
    where: {
      userId: userExists.id,
      products: {
        some: { id: id },
      },
    },
  });

  if (!productAlreadyExists) {
    const addProduct = await yesSensitivity.create({
      data: {
        brandName,
        productName,
        ingredients,
        image,
        user: {
          connect: {
            username: username,
          },
        },
        products: {
          connect: {
            id: id,
          },
        },
      },
    });
    res.status(200).json(addProduct);
  } else {
    return res.status(202).json({
      msg: "product already exsits on this list",
    });
  }
}
/////////////////////below////////////
////Delete a product from the yesSensitive list
async function deleteProductSensitiveTo(req, res) {
  const { id, brandName, productName, ingredients, image } = req.body;
  const { username } = req.params;
  const userExists = await user.findUnique({
    where: {
      username: username,
    },
    include: {
      yesSensitivity: true,
    },
  });
  if (!userExists) {
    return res.status(404).json({
      msg: "user not found",
    });
  }

  //
  const productAlreadyExists = await yesSensitivity.findMany({
    where: {
      products: { every: { id: id } },
    },
  });
  console.log(productAlreadyExists);

  // if (productAlreadyExists) {
  const deleteProduct = await yesSensitivity.delete({
    where: {
      id: id,
    },
  });
  console.log(deleteProduct);
  res.status(200).json(deleteProduct);
  // } else {
  return res.status(202).json({
    msg: "product does not exsit on this list",
  });
  // }
}

///delete test above///
////// Login User//////
async function userLogin(req, res) {
  const { username, password } = req.body;

  const currentUser = await user.findUnique({
    where: {
      username,
    },
  });

  // const accessToken = await jwt.signAccessToken(currentUser);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: 3600000,
  });
  if (!currentUser) {
    res.status(400).json({ msg: "Invalid Credentials" });
  }
  //comparing the hased password to the req.password
  const isMatch = bcrypt.compareSync(password, currentUser.password);
  if (!isMatch) {
    res.status(400).json({ error: "Invalid Credentials" });
  }

  res.status(200).json(token);
}

////Create a new user -- /signup /////
async function createNewUser(req, res) {
  const { username, password, firstName, lastName, email } = req.body;
  const errors = validationResult(req);

  //if errors are empty that's good, it means the user gave real password and email. If it's not empty send back status 400 with errors array.
  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: errors.array(),
    });
  }

  // TODO figure our how to password protect bcrypt.hash(password, 8).then(hasedPassword);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: 3600000,
  });
  //take the user password, add salt/8 random charaters to it and encrypt it.
  const hashedPassword = bcrypt.hashSync(password, 8);
  //Check database if the user already exists
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
      password: hashedPassword,
      token: token,
      firstName: firstName,
      lastName: lastName,
      email: email,
    },
  });
  //TODO do i need to add await user.save(); ?
  res.status(201).json(token);
}

//////

module.exports = {
  getUsers,
  getSingleUser,
  addSensitiveTo,
  deleteProductSensitiveTo,
  addNotSensitiveTo,
  createNewUser,
  userLogin,
};
