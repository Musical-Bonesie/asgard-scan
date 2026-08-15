const { validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const { user, noSensitivity, yesSensitivity } = new PrismaClient();

// Was 8. 12 is the current sensible floor for bcrypt.
const BCRYPT_COST = 12;
// Was 3600000, which jsonwebtoken reads as *seconds* -- roughly 41 days.
const TOKEN_TTL = "1h";

// Identical response for "no such user" and "wrong password", so login cannot
// be used to enumerate accounts.
const INVALID_CREDENTIALS = { msg: "Invalid credentials." };

/** Fields safe to return to a client. Never includes `password`. */
const PUBLIC_USER_FIELDS = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  noSensitivity: true,
  yesSensitivity: true,
};

/**
 * Confirms the authenticated caller owns the account named in the URL.
 * Returns true when the request may proceed, responds 403 otherwise.
 */
function ownsAccount(req, res) {
  if (req.user && req.user.username === req.params.username) {
    return true;
  }
  res.status(403).json({ msg: "You may only access your own account." });
  return false;
}

function issueToken(currentUser) {
  return jwt.sign(
    { id: currentUser.id, username: currentUser.username },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// GET a single user -- only ever your own.
async function getSingleUser(req, res, next) {
  try {
    if (!ownsAccount(req, res)) return;

    const singleUser = await user.findUnique({
      where: { username: req.params.username },
      select: PUBLIC_USER_FIELDS,
    });

    if (!singleUser) {
      return res.status(404).json({ msg: "User not found." });
    }
    return res.status(200).json(singleUser);
  } catch (err) {
    return next(err);
  }
}

/** Shared implementation for the two sensitivity lists. */
function addToList(model, listName) {
  return async function handler(req, res, next) {
    try {
      if (!ownsAccount(req, res)) return;

      const { id, brandName, productName, ingredients, image } = req.body;
      const userId = req.user.id;

      const alreadyExists = await model.findFirst({
        where: { userId, products: { some: { id } } },
      });

      if (alreadyExists) {
        return res
          .status(200)
          .json({ msg: `Product is already on your ${listName} list.` });
      }

      const added = await model.create({
        data: {
          brandName,
          productName,
          ingredients,
          image,
          user: { connect: { id: userId } },
          products: { connect: { id } },
        },
      });

      return res.status(201).json(added);
    } catch (err) {
      return next(err);
    }
  };
}

const addNotSensitiveTo = addToList(noSensitivity, "not sensitive to");
const addSensitiveTo = addToList(yesSensitivity, "sensitive to");

/**
 * DELETE a product from the caller's "sensitive to" list.
 *
 * The URL now carries the sensitivity record id rather than a username, and
 * `deleteMany` is scoped by `userId`, so a record belonging to someone else
 * simply matches nothing. There is no way to delete another user's data.
 */
async function deleteProductSensitiveTo(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ msg: "Invalid product id." });
    }

    const { count } = await yesSensitivity.deleteMany({
      where: { id, userId: req.user.id },
    });

    if (count === 0) {
      return res.status(404).json({ msg: "Product is not on your list." });
    }
    return res.status(200).json({ msg: "Product removed." });
  } catch (err) {
    return next(err);
  }
}

async function userLogin(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    const currentUser = await user.findUnique({ where: { username } });

    // Must return. The original fell through and dereferenced null here.
    if (!currentUser) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(password, currentUser.password);
    if (!isMatch) {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    // Signed only after authentication succeeds, and bound to the real user.
    return res.status(200).json({ token: issueToken(currentUser) });
  } catch (err) {
    return next(err);
  }
}

async function createNewUser(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, firstName, lastName, email } = req.body;

    const userExists = await user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (userExists) {
      return res.status(400).json({ msg: "Username is unavailable." });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    // No `token` field: JWTs are stateless and are never persisted.
    const newUser = await user.create({
      data: { username, password: hashedPassword, firstName, lastName, email },
    });

    return res.status(201).json({ token: issueToken(newUser) });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSingleUser,
  addSensitiveTo,
  addNotSensitiveTo,
  deleteProductSensitiveTo,
  createNewUser,
  userLogin,
};
