import React from "react";
import { signUpNewUser } from "../../utils/dataUtils";
import asgard_logo from "../../assets/logo/instagram_profile_logo_01.png.jpg";
import "./SignUp.scss";

class SignUp extends React.Component {
  state = {
    formData: null,
  };
  handleChange = (e) => {
    this.setState({
      formData: { ...this.state.formData, [e.target.name]: e.target.value },
    });
  };
  handleSubmit = (e) => {
    e.preventDefault();
    signUpNewUser(this.state.formData)
      .then((res) => {
        console.log(res.data);
        this.props.history.push("/login");
      })
      .catch((error) => alert(error, "signup was unsuccessful"));
  };

  showLogin = () => {
    this.props.history.push("/login");
  };

  render() {
    console.log(this.state.formData);
    return (
      <div className="signUp">
        <img
          className="signUp__logo"
          src={asgard_logo}
          alt="asgard beauty logo"
        />
        <h1 className="signUp__heading">
          Sign-Up and find out what your skin is sensitive to.
        </h1>
        <form className="signUp__form" onSubmit={this.handleSubmit}>
          <label className="signUp__label">Username</label>
          <input
            className="signUp__input"
            type="text"
            name="username"
            placeholder="freya_o"
            onChange={this.handleChange}
          />
          <label className="signUp__label">First Name</label>
          <input
            className="signUp__input"
            type="text"
            name="firstName"
            placeholder="Freya"
            onChange={this.handleChange}
          />
          <label className="signUp__label">Last Name</label>
          <input
            className="signUp__input"
            type="text"
            placeholder="Østevik"
            name="lastName"
            onChange={this.handleChange}
          />
          <label className="signUp__label">Email</label>
          <input
            className="signUp__input"
            type="email"
            name="email"
            placeholder="freya.o@gmail.com"
            onChange={this.handleChange}
          />
          <label className="signUp__label">Password</label>
          <input
            className="signUp__input"
            type="password"
            name="password"
            placeholder="minimum 8 characters"
            onChange={this.handleChange}
          />

          <div className="signUp__buttons">
            <button className="signUp__btn-grad " type="submit">
              Sign up
            </button>
            <button
              className="signUp__btn-grad "
              type="button"
              onClick={this.showLogin}
            >
              Log in
            </button>
          </div>
        </form>
      </div>
    );
  }
}

export default SignUp;
