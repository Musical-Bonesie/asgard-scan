import { v4 as uuidv4 } from "uuid";
import add from "../../assets/logo/add-product.svg";
import { URL } from "../../utils/dataUtils";

import "./NoSensitivity.scss";

export default function NoSensitivity({ addProductNoSensitivity, products }) {
  return (
    <div className="cardNotSensitive">
      {products.map((product) => {
        return (
          <div className="cardNotSensitive__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="cardNotSensitive__image"
              variant="top"
              src={`${URL}/${product.image}`}
            />
            <img
              onClick={(e) => addProductNoSensitivity(e, product)}
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
