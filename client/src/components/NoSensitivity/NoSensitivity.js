import { v4 as uuidv4 } from "uuid";
import add from "../../assets/logo/add-product.svg";
import "./NoSensitivity.scss";

export default function NoSensitivity({
  addProductNoSensitivity,
  noSensitivity,
}) {
  //TODO now the the button works and goes to the handleClick function on HomePage add it to the users no_sensitivity list in DB
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
