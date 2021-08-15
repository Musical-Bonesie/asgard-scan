import React, { Component } from "react";
import likelySensitive from "../../assets/logo/high-likelyhood-text.svg";
import alertIcon from "../../assets/logo/alert-icon.svg";
import add from "../../assets/logo/add-product.svg";
import ProductsCarousel from "../../components/ProductsCarousel/ProductsCarousel";
import ProductList from "../../components/ProductList/ProductList";
import IngredientList from "../../components/IngredientList/IngredientList";
import "./HomePage.scss";
import { getProducts, getUser } from "../../utils/dataUtils";

export default class HomePage extends Component {
  state = {
    userProducts: null,
    currentUser: null,
    sensitiveToIngredients: null,
    item: null,
  };
  componentDidMount() {
    getProducts()
      .then((res) => {
        this.setState({
          userProducts: res.data,
        });
        return getUser();
      })
      .then((res) => {
        let yesIngredients = res.data[0].yes_products.map((item) =>
          item.ingredients.toLowerCase()
        );
        const notSensitiveToArray = yesIngredients.toString().split(",");

        let noIngredients = res.data[0].no_products.map((item) =>
          item.ingredients.toLowerCase()
        );
        const sensitiveToArray = noIngredients.toString().split(",");

        const ingredientSensitivity = sensitiveToArray.filter(
          (ingredient) => !notSensitiveToArray.includes(ingredient)
        );

        this.setState({ sensitiveToIngredients: ingredientSensitivity });
      })
      .catch((error) => {
        console.log("error in componentDIdMount", error);
      });
  }

  // TODO move getUser and ingredients into this function sensitiveTo() {}
  handleClick = (item) => {
    this.setState({ item: item });
    console.log("carousel button was clicked:", item);
  };
  render() {
    return (
      this.state.userProducts &&
      this.state.sensitiveToIngredients && (
        <>
          <IngredientList
            sensitiveToIngredients={this.state.sensitiveToIngredients}
          />

          <main className="main">
            <h2 className="main__heading">
              Already know what you're sensitive to?
            </h2>
            <div className="main__search">
              <label className="main__copy">
                {" "}
                Type in the ingredient names that you're sensitive to seperate
                by a comma to find out which products don't have them!
                <input
                  className="main__search--input"
                  type="text"
                  placeholder="Lauryl Laurate, Tocopheryl Acetate,..."
                  onChange={this.handleOnChange}
                />
              </label>
              <h2 className="main__heading">AM I SENSITIVE?</h2>
              {/* // add these products to the "Yes" Products Array */}

              <p className="main__copy">
                Add at lest one product that works for you{" "}
              </p>
              <ProductsCarousel handleClick={this.handleClick} />
              {/* Add these products to the "No"/Cause Reaction Array */}
              <p className="main__copy">
                {" "}
                Add products that you've had a negative reaction to
              </p>
              <ProductsCarousel />
            </div>
            <h2 className="carousel__heading">DIVCOVER PRODUCTS</h2>
            <p className="carousel__copy">
              We've curated some products that don't contain any of the
              ingredients you are sensitive to!
            </p>
            <ProductList products={this.state.userProducts} />
            <button type="button" onClick={this.logout}>
              Log out
            </button>
          </main>
        </>
      )
    );
  }
}
