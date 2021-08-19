const productsController = require("../controllers/productsController");
const router = require("express").Router();
const path = require("path");
const public = path.join(__dirname, "public");

//GET
router.get("/", productsController.getProducts);

//Test Post so instead this product
//this post can't be create without the user
router.post("/", async (req, res) => {
  //need to provide user id so it can be associated with this
  const { title, content, user_id } = req.body;
  //check if user exsits
  const userExists = await userExists.findUnique({
    where: {
      id: user_id,
    },
  });
  //if user does NOT exist
  if (!userExists) {
    return res.status(400).json({
      meg: "user not found",
    });
  }
  //creating a new post
  const newPost = await this.post.update({
    data: {
      title,
      //column name is post
      post: conten,
      user_id,
    },
  });
  res.json(newPost);
});

module.exports = router;
