import React, { Component } from "react";
import NoSensitivity from "../../components/NoSensitivity/index";
import YesSensitivity from "../../components/YesSensitivity/YesSensitivity";
import ProductList from "../../components/ProductList/ProductList";
import IngredientList from "../../components/IngredientList/IngredientList";
import Footer from "../../components/Footer/index";
import Alert from "../../assets/logo/alert-icon.svg";
import {
  getProducts,
  getSingleUser,
  addNotSensitiveProduct,
  addSensitiveToProduct,
  deleteProductSensitiveTo,
} from "../../utils/dataUtils";
import "./HomePage.scss";
import Modal from "react-modal";

Modal.setAppElement("#root");

export default class HomePage extends Component {
  state = {
    userID: null,
    username: this.props.username,
    token: null,
    products: null,
    displayProducts: null,
    noSensitivity: null,
    yesSensitivity: null,
    currentUser: null,
    sensitiveToIngredients: null,
    item: null,
    ingredientSearch: [],
    isActive: false,
    deletedItem: [],
    modal: false,
  };

  componentDidMount() {
    const username = sessionStorage.getItem("username");

    this.setState({ token: sessionStorage.getItem("token") });
    getProducts()
      .then((res) => {
        this.setState({
          products: res.data,
        });
        return getSingleUser(username);
        // return getSingleUser(username, this.state.token);
      })
      .then((response) => {
        const user = response.data;
        this.setState({
          userID: user.id,
          username: user.username,
          yesSensitivity: user.yesSensitivity,
          noSensitivity: user.noSensitivity,
        });
        this.getSensitivityIngredients(user);
      })
      .catch((error) => {
        console.log("error in componentDIdMount", error);
      });
  }

  // Function for closing the modal.
  closeModal = () => this.setState({ modal: false });

  //Open Modal and Delete Item are temporary until user profile page is created//
  toggleModal = (item) => {
    this.setState({
      modal: !this.state.modal,
      deletedItem: item,
    });
  };
  deleteItem = () => {
    let deletedProduct = this.state.yesSensitivity.find(
      (product) => product.productName === this.state.deletedItem.productName
    );
    console.log(deletedProduct.id);
    deleteProductSensitiveTo(deletedProduct.id)
      .then((res) => {
        console.log(res.data);
        // TODO add logic to only remove the deleted Item from yesSensitivity list
        if (res.status === 200) {
          console.log("The Response status was 200!");

          // this.setState({
          //   yesSensitivity: res.data,

          // });
        }
      })
      .catch((error) => {
        console.log(error);
      });
  };
  //close the modal/delete an item.

  deleteItemFunc = () => {
    this.closeModal();
    this.deleteItem();
  };

  // //Find ingredients that the user is senstive to by comparing their no_sensitivity list to yes_sensitivity list
  // and return ingredients not in the no_sensitivity list.
  getSensitivityIngredients = (user) => {
    let yesIngredients = user.noSensitivity.map((item) =>
      item.ingredients.toLowerCase()
    );
    const notSensitiveToArray = yesIngredients.toString().split(",");
    let noIngredients = user.yesSensitivity.map((item) =>
      item.ingredients.toLowerCase()
    );
    const sensitiveToArray = noIngredients.toString().split(",");
    const ingredientSensitivity = sensitiveToArray.filter(
      (ingredient) => !notSensitiveToArray.includes(ingredient)
    );

    this.setState({
      sensitiveToIngredients: ingredientSensitivity,
    });
  };

  //update ingredient list once a product has been added to the no_sensitivitie list or yes_sensitivity list
  upDateNotSesitiveTo = (res) => {
    let yesIngredients = this.state.noSensitivity.map((item) =>
      item.ingredients.toLowerCase()
    );
    const notSensitiveToArray = yesIngredients.toString().split(",");

    let noIngredients = this.state.yesSensitivity.map((item) =>
      item.ingredients.toLowerCase()
    );
    const sensitiveToArray = noIngredients.toString().split(",");

    const ingredientSensitivity = sensitiveToArray.filter(
      (ingredient) => !notSensitiveToArray.includes(ingredient)
    );

    this.setState({
      sensitiveToIngredients: ingredientSensitivity,
    });
  };

  //User adds products to their yesSensitive list
  addProductSensitivity = (product) => {
    this.setState({ item: product, isActive: !this.state.isActive });

    console.log("I'm sensitive to this product:", product);
    addSensitiveToProduct(this.state.username, product)
      .then((res) => {
        //add the products selected and send the ingredients to upDateNotSensitiveTo()
        let addProduct = this.state.yesSensitivity;
        if (res.status !== 200) {
          return;
        } else if (
          !this.state.yesSensitivity.find(
            (product) => product.id === res.data.id
          )
        ) {
          addProduct.push(res.data);
        } else {
          return;
        }

        console.log(addProduct);
        this.setState({ yesSensitivity: addProduct });
        this.upDateNotSesitiveTo();
      })
      .catch((error) => {
        console.log("product did not add", error);
      });
    console.log(this.state.yesSensitivity);
  };

  //Add product that user is NOT sensitive to and it compares ingredient list to products user IS sensitive to
  addProductNoSensitivity = (e, product) => {
    e.preventDefault();
    console.log("I'm not sensitive to this product:", product);
    addNotSensitiveProduct(this.state.username, product)
      .then((res) => {
        let addProduct = this.state.noSensitivity;
        if (res.status !== 200) {
          return;
        } else if (
          !this.state.noSensitivity.find(
            (product) => product.id === res.data.id
          )
        ) {
          addProduct.push(res.data);
        } else {
          return;
        }

        this.setState({ noSensitivity: addProduct });

        this.upDateNotSesitiveTo();
      })
      .catch((error) => {
        console.log("product did not add", error);
      });
  };
  //User types ingredents into the search bar: water, coconut oil, etc...  and returns products that do not contain those ingredients shown in the SEE MORE section/toggle()
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
    //Remove the item/token: i.e sesstionStorage.removeItem() once user log out
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    this.props.history.push("/login");
  };

  render() {
    return (
      this.state.products && (
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
                Type in the ingredient names that you're sensitive to seperated
                by a comma and click on the button that appears below to find
                out which products don't contain them!
                <input
                  className="main__search--input"
                  type="text"
                  placeholder="Lauryl Laurate, Tocopheryl Acetate..."
                  onChange={this.handleOnChange}
                />
              </label>
              <ProductList displayProducts={this.state.displayProducts} />
              <h2 className="main__heading">AM I SENSITIVE?</h2>

              <p className="main__copy">
                Add at least one product that you have used and do NOT have
                sensitivity towards
              </p>
              <NoSensitivity
                products={this.state.products}
                addProductNoSensitivity={this.addProductNoSensitivity}
                isActive={this.state.isActive}
              />

              <p className="main__copy">
                {" "}
                Add products that you've had a negative reaction to below
              </p>
              <YesSensitivity
                addProductSensitivity={this.addProductSensitivity}
                isActive={this.state.isActive}
                products={this.state.products}
                toggleModal={this.toggleModal}
              />
            </div>
            {/* ///TODO Once User page is created, delete Modal and function with modal below */}
            <Modal
              isOpen={this.state.modal === true}
              className="modal__modal"
              overlayClassName="modal__overlay"
              transparent={true}
            >
              <div className="modal__modal-top">
                <h1 className="modal__modal-item">
                  Delete {this.state.deletedItem.productName} from your
                  sensitive list?
                </h1>
                <img
                  onClick={this.closeModal}
                  className="modal__modal-close"
                  src={Alert}
                  alt="Close Icon"
                />
              </div>
              <div>
                <p className="modal__modal-description">
                  Please confirm that you'd like to delete{" "}
                  {this.state.deletedItem.productName} from your Sensitive To
                  list.
                </p>
                <img
                  className="modal__modal-image"
                  src={this.state.deletedItem.image}
                  alt="delete item from your yes sensitivity list"
                />
              </div>
              <div className="modal__modal-buttons">
                <button
                  onClick={this.closeModal}
                  className="modal__modal-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={this.deleteItemFunc}
                  className="modal__modal-confirm"
                >
                  Delete
                </button>
              </div>
            </Modal>
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
