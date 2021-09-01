import { v4 as uuidv4 } from "uuid";
import { URL } from "../../utils/dataUtils";
import add from "../../assets/logo/add-product.svg";
import Alert from "../../assets/logo/see-more.svg";
import "./YesSensitivity.scss";

export default function YesSensitivity({
  addProductSensitivity,
  products,
  toggleModal,
}) {
  return (
    <div className="cardSensitive">
      {products.map((product) => {
        return (
          <div className="cardSensitive__content" key={uuidv4()}>
            <img
              alt={product.productName}
              className="cardSensitive__image"
              variant="top"
              src={`${URL}/${product.image}`}
            />
            <img
              onClick={(e) => addProductSensitivity(e, product)}
              className="cardSensitive__button"
              src={add}
              alt="add a yes product"
            />

            <div className="cardSensitive__body">
              <h2 className="cardSensitive__heading">
                <strong>{product.brandName}</strong> <br />{" "}
                {product.productName}{" "}
              </h2>
              <div
                onClick={() => toggleModal(product)}
                className="cardSensitive__delete"
                src={Alert}
                alt="delete this product form your Yes Sensitivity list"
              >
                Remove Item
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
