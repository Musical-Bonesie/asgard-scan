import React, { Component } from "react";
import logo from "../../../assets/logo/asgard-logo.jpg";

export default class Login extends Component {
  state = {
    formData: null,
  };

  render() {
    return (
      <div className="loggin">
        <img src={logo} alt="asgard beauty logo" />
        <h1>Knock Knock. Who's There?</h1>
        <form onSubmit={this.handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            name="email"
            placeholder="username"
            onChange={this.handleChange}
          />
          <label>Password</label>
          <input
            type="password"
            name="password"
            placeholder="password"
            onChange={this.handleChange}
          />
          <div className="user-form__buttons">
            <button type="submit">Log in</button>
            <button type="button" onClick={this.showSignUp}>
              Sign up
            </button>
          </div>
        </form>
      </div>
    );
  }
}
