import { v4 as uuidv4 } from "uuid";
import add from "../../assets/logo/add-product.svg";
import "./NoSensitivity.scss";

export default function NoSensitivity({
  addProductNoSensitivity,
  noSensitivity,
}) {
  // let product_id = userYesProducts;

  //TODO now the the button works and goes to the handleClick function on hommePage.
  // Map through no_products map through no_products and if it was clicked --> gets added to the no_product array list of that user.
  //might have to create a yesproductHandleClick and a noproductHandleClick to track which products go to which list
  //
  return (
    <div className="cardNotSensitive">
      {noSensitivity.map((product) => {
        let product_id = product.id;
        return (
          <div className="cardNotSensitive__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="cardNotSensitive__image"
              variant="top"
              src={product.image}
            />
            <img
              onClick={() => addProductNoSensitivity(product_id)}
              className="cardNotSensitive__button"
              src={add}
              alt="add a yes product"
            />
            <div className="cardNotSensitive__body">
              <h2 className="cardNotSensitive__heading">
                <strong>{product.brandName}</strong> <br />{" "}
                {product.productName}{" "}
              </h2>
            </div>
          </div>
        );
      })}
    </div>
  );
}
