import { v4 as uuidv4 } from "uuid";
import add from "../../assets/logo/add-product.svg";
import { PORT } from "../../utils/dataUtils";

import "./NoSensitivity.scss";

export default function NoSensitivity({
  addProductNoSensitivity,
  products,
  isActive,
}) {
  return (
    <div className="cardNotSensitive">
      {products.map((product) => {
        return (
          <div className="cardNotSensitive__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="cardNotSensitive__image"
              variant="top"
              src={`${PORT}${product.image}`}
            />
            <img
              onClick={() => addProductNoSensitivity(product)}
              className="cardNotSensitive__button"
              //TODO removed this until I fix the issues {
              //   isActive
              //     ? "cardNotSensitive__button"
              //     : "cardNotSensitive__button--added"
              // }
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
