import React, { Component } from "react";
import asgard_logo from "../../assets/logo/instagram_profile_logo_01.png.jpg";
import button from "../../assets/logo/button.svg";
import "./Login.scss";

export default class Login extends Component {
  state = {
    formData: null,
  };
  handleChange = (e) => {
    this.setState({
      formData: { ...this.state.formData, [e.target.name]: e.target.value },
    });
  };
  //TODO onSubmit makes a post req --> redirects to home.
  //add the functionality once DB is created.
  handleSubmit = (event) => {
    event.preventDefault();
    this.props.history.push("/");
    // axios
    //   .post("/users/login", this.state.formData)
    //   .then((res) => {
    //     sessionStorage.setItem("token", res.data.token);
    //     this.props.history.push("/");
    //   })
    //   .catch((error) => alert(error));
  };

  //Once sign-up button is clicked, it takes the user to sign-up page
  showSignUp = () => {
    this.props.history.push("/signup");
  };
  render() {
    return (
      <div className="login">
        <img
          className="login__logo"
          src={asgard_logo}
          alt="asgard beauty logo"
        />
        <h1 className="login__heading">Knock Knock. Who's There?</h1>
        <form className="login__form" onSubmit={this.handleSubmit}>
          <input
            className="login__input-top"
            type="email"
            name="email"
            placeholder="username"
            onChange={this.handleChange}
          />
          <input
            className="login__input-bottom"
            type="password"
            name="password"
            placeholder="password"
            onChange={this.handleChange}
          />
          <input src={button} className="login__button" type="image" />

          <div
            className="login__signUp-link"
            type="button"
            onClick={this.showSignUp}
          >
            SIGN UP
          </div>
        </form>
        <p className="login__disclaimer">
          {" "}
          Disclaimer. This app was created not as a medical guide but as a
          helpful tool to catalogue products. For medical advice, you should
          always consult a doctor.
        </p>
      </div>
    );
  }
}
