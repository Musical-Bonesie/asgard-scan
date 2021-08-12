const router = require("express").Router();
const User = require("../models/user");
const jwt = require("jsonwebtoken"); //jwt libary installed
const bcrypt = require("bcryptjs"); // means within server directory ablity to encrypt passwords
const Task = require("../models/task");
const authorize = require("../middleware/authorize"); // middleware to check there is an authroization header sent

//LIVE DEMO - Updating OG
router.post("/", (req, res) => {
  const { password } = req.body;
  //encrpt password using npm package bcrypt. Then run same query in mySQL in terminal: mysql> SELECT * users ?(missed this in LEC)
  bcrypt.hash(password, 8).then(hasedPassword);
  new User({ ...req.body, password: hasedPassword })
    .save()
    //in the .then((user)) gives us access to the user info to create a token below.
    .then((user) => {
      //create a veriable called token and use jwt library jwt.sign() method. Needs info from payload and give secret key used to create jwt stored in .env
      const token = jwt.sign(
        { id: user.id, email: user.attributes.email },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      ); //attributes is from bookshelf.js gives us access to atrributes
      res.status(201).json({ user });
    })
    .catch((err) => {
      res.status(400).send({ error: err.message });
    });
});

//CREATE new user
//TODO: Update this so that when a new user is created, their password is encrypted before it is stored on the database. Then, generate a JSON web token and send it with the response.
// router.post("/", (req, res) => {
//   const { password } = req.body;
//   //create a new user and save in DB and return to the user with status code 201
//   // new User({ ...req.body, password: password })
//   //   .save()
//   //   .then((user) => {
//   //     res.status(201).json({ user });
//   //   })
//   //   .catch((err) => {
//   //     res.status(400).send({ error: err.message });
//   //   });
// });
//LIVE-DEMO below in Postman: localhost: 8080/api/users/login and in the body { email: some@email.com, password: aeuygfa} and response shows all of michael or user info along with password so we need to update and encrypt.
router.post("/login", async (req, res) => {
  //User.where -- find this user by finding the one that matches this e-mail in the DB. THat's how we have access to user in the .then
  User.where({ email: req.body.email })
    //check for encrypted info like the password and make sure it matchs
    .fetch()
    .then((user) => {
      //build logic to make sure before the respon happens. We want to make sure the user password matches the encripted one in our DB
      //bcrypt.compareSync make it synce because we need it to happen before the response etc.. takes two values. The things we are comparing and retunrs a boolean true/false
      const isMatch = bcrypt.compareSync(
        req.body.password,
        user.attributes.password
      ); //req.body.password thats stored on DB compared to user.attributes.passwords (the encrptyed one that we use bcrypt to compare the POST req )
      //now we add logic incase the user info doesn't match so the user can't get access if they're trying to hack it
      if (!usMatch) {
        res.status(401).json({ error: "invalid credentials." });
      }
      //now we create a token, passed two arug for sure and then we passed a third which is optional
      const token = jwt.sign(
        { id: user.id, email: user.attributes.email },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );
      res.status(201).json({ user, token });
    })
    .catch((err) => {
      res.status(400).json({ error: err.message });
    });
});
//LOGIN user
//TODO: Verify that the user has entered the password associated with their account. Then, generate a JSON web token and send it with the response.
// router.post("/login", async (req, res) => {
//   //user wanted to log in .where method used to look for  specific user in the DB. look for an e-mail that matchs the email in the req.body.email
//   User.where({ email: req.body.email })
//     .fetch()
//     .then((user) => {
//       res.status(201).json({ user });
//     })
//     .catch((err) => {
//       res.status(400).json({ error: err.message });
//     });
// });

//Get Current User
//TODO: Write a middleware function in server/middleware/authorize.js to verify that a user has sent their JSON web token in the authorization headers of their request, and that it is valid. Invoke the middleware function.
//send abck user and tasks if the user is authorized. see middelware aithorize
router.get("/current", authorize, (req, res) => {
  User.where({ id: req.decoded.id })
    .fetch()
    .then((user) => {
      //why did we spread in the user attributes and password to null. Because you don't want to send the password to the client so we set it to null (but doens't update it to DB. instead of showing password even if it'd encry[pted update hte password to null in the current user veriable])
      const currentUser = { ...user.attributes, password: null };
      Task.where({ user_id: currentUser.id })
        .fetchAll()
        .then((tasks) => {
          res.status(200).json({ currentUser, tasks });
        });
    })
    .catch((err) => {
      res.status(500).json({ error: err.message });
    });
});

module.exports = router;

//Adding JSON Web Token to update all 3 routes to ask for authorization.
// Task. is select all the tasks is talking to bookshelf
