const router = require("express").Router();
const { check } = require("express-validator");

const usersController = require("../controllers/usersController");
const authorize = require("../middleware/authorize");

// NOTE: `GET /users` is deliberately absent. It previously returned every user
// in the database along with their skin-sensitivity records, unauthenticated.

// --- Public routes -------------------------------------------------------

router.post(
  "/login",
  [
    check("username").isString().trim().notEmpty(),
    check("password").isString().notEmpty(),
  ],
  usersController.userLogin
);

router.post(
  "/signup",
  [
    check("username")
      .isString()
      .trim()
      .isLength({ min: 3, max: 255 })
      .withMessage("Username must be 3-255 characters"),
    check("email")
      .isEmail()
      .withMessage("Please provide a valid email")
      .normalizeEmail(),
    check("password")
      .isLength({ min: 6 })
      .withMessage("Please create a password with more than 5 characters"),
    check("firstName").isString().trim().notEmpty(),
    check("lastName").isString().trim().notEmpty(),
  ],
  usersController.createNewUser
);

// --- Authenticated routes ------------------------------------------------
// Every route below requires a valid bearer token. Handlers additionally check
// ownership, because a valid token for user A must not grant access to user B.

router.get("/:username", authorize, usersController.getSingleUser);

// Add a product the user is NOT sensitive to.
router.patch("/:username", authorize, usersController.addNotSensitiveTo);

// Add a product the user IS sensitive to.
router.patch(
  "/sensitive/:username",
  authorize,
  usersController.addSensitiveTo
);

// Remove one of the caller's own "sensitive to" records, addressed by its id.
router.delete(
  "/sensitive/:id",
  authorize,
  usersController.deleteProductSensitiveTo
);

module.exports = router;
