import React, { Component } from "react";
import NoSensitivity from "../../components/NoSensitivity/index";
import YesSensitivity from "../../components/YesSensitivity/YesSensitivity";
import ProductList from "../../components/ProductList/ProductList";
import IngredientList from "../../components/IngredientList/IngredientList";
import Footer from "../../components/Footer/index";
import {
  getProducts,
  getUser,
  getSingleUser,
  addNotSensitiveProduct,
  addSensitiveToProduct,
} from "../../utils/dataUtils";
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
    const userID = this.props.match.params.id;

    getProducts()
      .then((res) => {
        this.setState({
          products: res.data,
        });

        return getSingleUser(userID);
      })
      .then((res) => {
        console.log(res.data);
        this.setState({ noSensitivity: res.data.no_sensitivity });
        let yesIngredients = res.data.no_sensitivity.map((item) =>
          item.ingredients.toLowerCase()
        );
        const notSensitiveToArray = yesIngredients.toString().split(",");

        let noIngredients = res.data.yes_sensitivity.map((item) =>
          item.ingredients.toLowerCase()
        );
        const sensitiveToArray = noIngredients.toString().split(",");

        const ingredientSensitivity = sensitiveToArray.filter(
          (ingredient) => !notSensitiveToArray.includes(ingredient)
        );

        this.setState({
          sensitiveToIngredients: ingredientSensitivity,
          noSensitivity: res.data.no_sensitivity,
          yesSensitivity: res.data.yes_sensitivity,
        });
      })
      .catch((error) => {
        console.log("error in componentDIdMount", error);
      });
  }

  // TODO move getUser and ingredients into this function sensitiveTo() {}
  addProductSensitivity = (product) => {
    const userID = this.props.match.params.id;

    this.setState({ item: product });
    console.log("I'm sensitive to this product:", product);
    // addSensitiveToProduct(userID, product)
    //   .then((res) => {
    //     console.log(res.data);
    //     //TODO do I need to setState if the file changed? this.setState({ noSensitivity });
    //   })
    //   .catch((error) => {
    //     console.log("product did not add", error);
    //   });
    // console.log(this.state.yesSensitivity);
  };

  addProductNoSensitivity = (product) => {
    const userID = this.props.match.params.id;
    this.setState({ item: product });
    console.log("I'm not sensitive to this product:", product);
    addNotSensitiveProduct(userID, product)
      .then((res) => {
        console.log(res.data);
        //return get.()
        //TODO do I need to setState if the file changed? this.setState({ noSensitivity });
      })
      .catch((error) => {
        console.log("product did not add", error);
      });
    console.log(this.state.noSensitivity);
  };
  //User types ingredents into the search bar and returns products in the SEE MORE
  handleOnChange = (event) => {
    event.preventDefault();
    console.log(event.target.value);
    const searchIngredients = event.target.value.toLowerCase();
    console.log(searchIngredients);
    const searchArr = searchIngredients.split(",");
    console.log(searchIngredients);
    console.log(searchArr);

    this.setState({
      displayProducts: this.state.products.filter((product) => {
        return !product.ingredients.toLowerCase().includes(searchIngredients);
      }),
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
    console.log(this.state.products);
    //ingredent list
    console.log(this.state.sensitiveToIngredients);
    // user no_sensitivity list:
    console.log(this.state.noSensitivity);
    //user yes_sensitivity list:
    console.log(this.state.yesSensitivity);
    //null until user searchs for products without certain ingredients
    console.log(this.state.displayProducts);

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
                products={this.state.products}
                addProductNoSensitivity={this.addProductNoSensitivity}
              />

              <p className="main__copy">
                {" "}
                Add products that you've had a negative reaction to
              </p>
              <YesSensitivity
                addProductSensitivity={this.addProductSensitivity}
                products={this.state.products}
              />
            </div>
            <h2 className="main__heading">DIVCOVER PRODUCTS</h2>
            <p className="main__copy">
              We've curated some products that don't contain any of the
              ingredients you are sensitive to!
            </p>
            {/* //TODO change to display products  */}
            <ProductList displayProducts={this.state.displayProducts} />
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
