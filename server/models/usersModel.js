const fs = require("fs");

const getUser = () => JSON.parse(fs.readFileSync("./data/users.json"));
const setUser = (user) => {
  fs.writeFileSync("./data/users.json", JSON.stringify(user));
};

module.exports = { getUser, setUser };
