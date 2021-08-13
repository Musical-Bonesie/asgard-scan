import React, { Component } from "react";
import likelySensitive from "../../assets/logo/high-likelyhood-text.svg";
import alertIcon from "../../assets/logo/alert-icon.svg";
import add from "../../assets/logo/add-product.svg";
import ProductList from "../../components/ProductList/ProductList";
import "./HomePage.scss";
import { getProducts, getUser } from "../../utils/dataUtils";

export default class HomePage extends Component {
  state = {
    userProducts: null,
    user: null,
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
        const yes = res.data[0].yes_products[0].ingredients.toLowerCase();
        const no = res.data[0].no_products[0].ingredients.toLowerCase();

        const yesArr = yes.split(",");
        const noArr = no.split(",");
        console.log(yesArr, "yes array");
        console.log(noArr);
        const difference = noArr.filter(
          (ingredient) => !yesArr.includes(ingredient)
        );
        console.log(difference);
      })
      .catch((error) => {
        console.log("error in componentDIdMount", error);
      });
  }

  ingredientMatch() {
    //compare two arrays the yes products and no products and return the similar ingrdients
    // turn all ingreidnets into toLowerCase()
  }

  render() {
    return (
      this.state.userProducts && (
        <>
          <header className="header">
            <h1 className="header__heading">
              WE THINK YOU MAY HAVE SENSITIVITIES TO:
            </h1>
            <img src={likelySensitive} alt="high likelyhood" />
            <section className="header__likelyhood">
              <p className="header__ingredients">
                .map trough ingredients that have been filtered
              </p>
              <img
                className="header__alert-icon"
                alt="sensitive to icon"
                src={alertIcon}
              />
            </section>
            <img src={likelySensitive} alt="high likelyhood" />
            <section className="header__likelyhood">
              <p className="header__ingredients">
                MODERATE LIKELYHOOD INGREDIENTS
              </p>
              <img
                className="header__alert-icon"
                alt="sensitive to icon"
                src={alertIcon}
              />
            </section>
          </header>
          <main className="main">
            {/* // add these products to the "Yes" Products Array */}
            <h2 className="main__heading">AM I SENSITIVE?</h2>
            <p className="main__copy">
              Add at lest one product that works for you{" "}
              <img className="__add-product" alt="add prodcut icon" src={add} />{" "}
              <br />
            </p>
            {/* Add these products to the "No"/Cause Reaction Array */}
            <p className="main__copy">
              {" "}
              Add products that you've had a negative reaction to
              <img className="__add-product" alt="add product icon" src={add} />
            </p>

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
            </div>
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
