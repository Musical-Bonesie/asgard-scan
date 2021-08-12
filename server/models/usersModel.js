const fs = require("fs");

const getUser = () => JSON.parse(fs.readFileSync("./data/users.json"));
const addUser = (user) => {
  fs.writeFileSync("./data/inventories.json", JSON.stringify(user));
};

module.exports = { getUser, addUser };
