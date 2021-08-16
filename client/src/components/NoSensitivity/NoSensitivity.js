import { v4 as uuidv4 } from "uuid";
import add from "../../assets/logo/add-product.svg";
import "./NoSensitivity.scss";

export default function NoSensitivity({ handleClick, noSensitivity }) {
  // let product_id = userYesProducts;
  console.log(noSensitivity);

  //TODO now the the button works and goes to the handleClick function on hommePage.
  // Map through no_products map through no_products and if it was clicked --> gets added to the no_product array list of that user.
  //might have to create a yesproductHandleClick and a noproductHandleClick to track which products go to which list
  //
  return (
    <div className="card">
      {noSensitivity.map((product) => {
        let product_id = product.id;
        return (
          <div className="card__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="card__image"
              variant="top"
              src={product.image}
            />
            <img
              onClick={() => handleClick(product_id)}
              className="card__button"
              src={add}
              alt="add a yes product"
            />
            <div className="card__body">
              <h2 className="card__heading">
                {product.brandName} <br /> {product.productName}{" "}
              </h2>
            </div>
          </div>
        );
      })}
    </div>
  );
}
