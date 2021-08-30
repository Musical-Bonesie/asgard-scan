import "./ProductList.scss";
import { Link } from "react-router-dom";
import noSensitivity from "../../assets/logo/no-sensitivity.svg";
import { PORT } from "../../utils/dataUtils";
import { v4 as uuidv4 } from "uuid";
import { Component } from "react";

export default class ProductList extends Component {
  state = {
    isActive: false,
  };

  handleToggle = () => {
    this.setState({ isActive: !this.state.isActive });
  };

  render() {
    const isActive = this.state.isActive;

    return (
      this.props.displayProducts && (
        <div className="product-list">
          <button
            onClick={this.handleToggle}
            // src={seeMore}
            alt="see more products link"
            className="product-list__btn-grad"
          >
            DISCOVER PRODUCTS
          </button>
          <div className={isActive ? "collasible--expand" : "collasible"}>
            <p className="product-list__copy">
              We've curated some products that don't contain any of the
              ingredients you are sensitive to!
            </p>
            {this.props.displayProducts.map((item) => (
              <div className="product-list__content" key={uuidv4()}>
                <div className="product-list__item">
                  <Link
                    className="product-list__link"
                    to={`/products/${item.id}`}
                  >
                    {" "}
                    <img
                      className="product-list__image"
                      src={`${PORT}${item.image}`}
                      alt={item.productName}
                    />
                    <h4 className="product-list__data">{item.productName}</h4>
                    <p className="product-list__label">{item.brandName}</p>
                  </Link>
                </div>

                <img
                  src={noSensitivity}
                  alt="sensitive icon"
                  className="product-list__icon"
                />
              </div>
            ))}
          </div>
        </div>
      )
    );
  }
}
