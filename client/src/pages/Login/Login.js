import React, { Component } from "react";
import asgard_logo from "../../assets/logo/instagram_profile_logo_01.png.jpg";
import disclaimer from "../../assets/logo/disclaimer.svg";
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
  //onSubmit make a post req -- > redirect to home.
  // handleSubmit = (e) => {
  //   e.preventDefault();
  //   axios
  //     .post("/users/login", this.state.formData)
  //     .then((res) => {
  //       sessionStorage.setItem("token", res.data.token);
  //       this.props.history.push("/");
  //     })
  //     .catch((error) => alert(error));
  // };
  //click on signup button you are promped to sign-up
  showSignUp = () => {
    this.props.history.push("/signup");
  };
  render() {
    return (
      <div className="login">
        <img src={asgard_logo} alt="asgard beauty logo" />
        <h1 className="login__heading">Knock Knock. Who's There?</h1>
        <form className="login__form" onSubmit={this.handleSubmit}>
          {/* <label className="login__label">Email</label> */}
          <input
            className="login__input"
            type="email"
            name="email"
            placeholder="username"
            onChange={this.handleChange}
          />
          {/* <label className="login__label">Password</label> */}
          <input
            className="login__input"
            type="password"
            name="password"
            placeholder="password"
            onChange={this.handleChange}
          />
          <button className=" btn-grad login__button" type="submit">
            Log in
          </button>
          <button
            className=" btn-grad login__button"
            type="button"
            onClick={this.showSignUp}
          >
            Sign up
          </button>
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
