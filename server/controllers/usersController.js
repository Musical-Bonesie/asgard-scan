const usersModel = require("../models/usersModel");
const uuid = require("uuid");

function getUser(req, res) {
  const users = usersModel.getUser();
  res.status(200).json(users);
}

//TODO figure out why this isnt't working..
function addYesProduct(req, res) {
  const users = usersModel.getUser();
  const singleUser = users.filter((user) => req.params.id === user.id);
  console.log(singleUser);
  singleUser.yes_products.push({ ...req.body });
  console.log(singleUser);
  usersModel.setUser(singleUser);
  res.statue(201).json(req.body);
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

// function editUserInfo (req, res) {
//   // Get the list of inventory items from inventories.json using the model.
//   const users = usersModel.getUser();
//   // Loop through the items looking for the item id that matches the request id using a for-loop
//   // so that we can return before responding (to avoid multiple response errors).
//   for (i in users) {
//     if (users[i].id === req.params.id) {
//       // Update the item's information.
//       users[i] = req.body;
//       // Write the updated inventories array to inventories.json using the model.
//       usersModel.setInventories(users);
//       res.status(200).json(users[i]);
//       return;
//     }
//   }

module.exports = { getUser, addUser, addYesProduct };
