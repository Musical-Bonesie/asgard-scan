const { PrismaClient } = require("@prisma/client");

const { products } = new PrismaClient();

// The product catalogue is public, non-personal reference data, so this route
// is intentionally unauthenticated.
async function getProducts(req, res, next) {
  try {
    const catalogue = await products.findMany({
      select: {
        id: true,
        brandName: true,
        productName: true,
        ingredients: true,
        category: true,
        status: true,
        image: true,
      },
    });
    return res.json(catalogue);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getProducts };
