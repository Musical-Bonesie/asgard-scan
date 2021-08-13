import "./ProductList.scss";
import { Link } from "react-router-dom";
import sensitivity from "../../assets/logo/sensitivity.svg";
import noSensitivity from "../../assets/logo/no-sensitivity.svg";
import seeMore from "../../assets/logo/see-more.svg";
import { v4 as uuidv4 } from "uuid";

export default function ProductList({ products }) {
  //created a reusable component to display an itemList (since it's used on multiple pages) and maintain styling consistency.
  // ItemList uses .map() to go through an item array recieved from props.
  //TODO create onClick functio that changes a veriable class name. Put veriable in className={} :-)
  let className = "collasible";
  function handleClick(event) {
    event.preventDefault();
    className = "collasible--expand";
    console.log("link was clicked");
  }

  return (
    <div className="product-list">
      <h3 className="product-list__heanding">YOUR PRODUCTS</h3>
      <p className="product-list__copy">
        {" "}
        We rely on your product entries to make our best guess as to what
        ingredients you might be allergic to. You can edit the products below
        that you've added.
      </p>
      <img
        src={seeMore}
        alt="see more products link"
        className="collasible__see-more"
      />
      {/* tried this a didferent onClick way?! */}
      <div className={className}>
        {products.map((item) => (
          <div className="product-list__content" key={uuidv4()}>
            <div className="product-list__item">
              <Link className="product-list__link" to={`/products/${item.id}`}>
                <h4 className="product-list__data">{item.productName}</h4>
                <p className="product-list__label">{item.brandName}</p>
              </Link>
            </div>

            <img
              src={`${
                item.status === "no sensitivity" ? noSensitivity : sensitivity
              }`}
              alt="sensitive icon"
              className="product-list__icon"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
