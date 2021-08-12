const usersModel = require("../models/usersModel");
const uuid = require("uuid");

function getUser(req, res) {
  const users = usersModel.getUser();
  res.status(200).json(users);
}

function addUser(req, res) {
  // Get the list of inventory items from inventories.json using the model.
  // const userInfo = usersModel.getUsers();
  // // Push the new item to the array
  // userInfo.push({ ...req.body, id: uuid.v4() });
  // // Write the updated inventories array to inventories.json using the model.
  // usersModel.setInventories(userInfo);
  // res.status(201).json(req.body);
}

module.exports = { getUser, addUser };
