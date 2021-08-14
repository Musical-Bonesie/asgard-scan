import "./ProductList.scss";
import { Link } from "react-router-dom";
import sensitivity from "../../assets/logo/sensitivity.svg";
import noSensitivity from "../../assets/logo/no-sensitivity.svg";
import seeMore from "../../assets/logo/see-more.svg";
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
      <div className="product-list">
        <h3 className="product-list__heanding">YOUR PRODUCTS</h3>
        <p className="product-list__copy">
          {" "}
          We rely on your product entries to make our best guess as to what
          ingredients you might be allergic to. You can edit the products below
          that you've added.
        </p>
        <img
          onClick={this.handleToggle}
          src={seeMore}
          alt="see more products link"
          className="product-list__see-more"
        />
        {/* tried this a didferent onClick way?! */}
        <div className={isActive ? "collasible--expand" : "collasible"}>
          {this.props.products.map((item) => (
            <div className="product-list__content" key={uuidv4()}>
              <div className="product-list__item">
                <Link
                  className="product-list__link"
                  to={`/products/${item.id}`}
                >
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
}
