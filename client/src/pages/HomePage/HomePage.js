import React, { Component } from "react";
import NoSensitivity from "../../components/NoSensitivity/index";
import YesSensitivity from "../../components/YesSensitivity/YesSensitivity";
import ProductList from "../../components/ProductList/ProductList";
import IngredientList from "../../components/IngredientList/IngredientList";
import Footer from "../../components/Footer/index";
import { getProducts, getUser } from "../../utils/dataUtils";
import "./HomePage.scss";

export default class HomePage extends Component {
  state = {
    products: null,
    displayProducts: null,
    noSensitivity: null,
    yesSensitivity: null,
    currentUser: null,
    sensitiveToIngredients: null,
    item: null,
    ingredientSearch: [],
  };
  componentDidMount() {
    getProducts()
      .then((res) => {
        this.setState({
          products: res.data,
        });
        console.log(res.data);
        return getUser();
      })
      .then((res) => {
        this.setState({ noSensitivity: res.data[0].no_sensitivity });
        let yesIngredients = res.data[0].no_sensitivity.map((item) =>
          item.ingredients.toLowerCase()
        );
        const notSensitiveToArray = yesIngredients.toString().split(",");

        let noIngredients = res.data[0].yes_sensitivity.map((item) =>
          item.ingredients.toLowerCase()
        );
        const sensitiveToArray = noIngredients.toString().split(",");

        const ingredientSensitivity = sensitiveToArray.filter(
          (ingredient) => !notSensitiveToArray.includes(ingredient)
        );
        console.log(ingredientSensitivity);

        this.setState({
          sensitiveToIngredients: ingredientSensitivity,
          noSensitivity: res.data[0].no_sensitivity,
          yesSensitivity: res.data[0].yes_sensitivity,
        });
      })
      .catch((error) => {
        console.log("error in componentDIdMount", error);
      });
  }

  // TODO move getUser and ingredients into this function sensitiveTo() {}
  addProductSensitivity = (product) => {
    this.setState({ item: product });
    console.log("I'm sensitive to this product:", product);
  };

  addProductNoSensitivity = (product) => {
    this.setState({ item: product });
    console.log("I'm not sensitive to this product:", product);
  };

  //TODO fix this: right now it pulls up products WITH the ingredients searched
  handleOnChange = (event) => {
    event.preventDefault();
    console.log(event.target.value);
    const searchIngredients = event.target.value.toLowerCase();
    console.log(searchIngredients);
    const searchArr = searchIngredients.split(",");
    console.log(searchIngredients);
    console.log(searchArr); // TODO delete this probably don't need an array?

    this.setState({
      displayProducts: this.state.products.filter((product) =>
        // product.ingredients.toLowerCase() !== searchIngredients
        {
          return product.ingredients.toLowerCase().includes(searchIngredients);
        }
      ),
    });
    console.log(this.state.displayProducts);
  };

  logout = () => {
    //created sessionStorage to loggin so on log out we remove the item/token: i.e sesstionStorage.removeItem()
    //sessionStorage.removeItem("token");
    this.props.history.push("/login");
    console.log(this.props.history);
  };

  render() {
    return (
      this.state.products &&
      this.state.sensitiveToIngredients &&
      this.state.noSensitivity &&
      this.state.yesSensitivity && (
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

              <p className="main__copy">
                Add at lest one product that works for you{" "}
              </p>
              <NoSensitivity
                noSensitivity={this.state.noSensitivity}
                addProductNoSensitivity={this.addProductNoSensitivity}
              />

              <p className="main__copy">
                {" "}
                Add products that you've had a negative reaction to
              </p>
              <YesSensitivity
                addProductSensitivity={this.addProductSensitivity}
                yesSensitivity={this.state.yesSensitivity}
              />
            </div>
            <h2 className="main__heading">DIVCOVER PRODUCTS</h2>
            <p className="main__copy">
              We've curated some products that don't contain any of the
              ingredients you are sensitive to!
            </p>
            <ProductList products={this.state.products} />
            <button
              className="main__btn-grad"
              type="button"
              onClick={this.logout}
            >
              Log out
            </button>
          </main>
          <Footer />
        </>
      )
    );
  }
}
