import React from "react";
import axios from "axios";
import asgardBackground from "../../assets/logo/asgard-background.jpg";
import "./SignUp.scss";

class SignUp extends React.Component {
  state = {
    formData: null,
  };
  //handles the same as login
  handleChange = (e) => {
    this.setState({
      formData: { ...this.state.formData, [e.target.name]: e.target.value },
    });
  };
  //post req to that endpoint associated with sign-up. sending form data
  handleSubmit = (e) => {
    e.preventDefault();
    axios
      .post("/users", this.state.formData)
      .then((res) => {
        //this session will exsit as long as the tab is open. token property

        sessionStorage.setItem("token", res.data.token);
        console.log(sessionStorage.setItem(res.data.token));
        this.props.history.push("/");
      })
      .catch((error) => alert(error));
  };

  showLogin = () => {
    this.props.history.push("/login");
  };

  render() {
    return (
      <div className="signUp">
        <img className="signUp__banner" src={asgardBackground} />
        <h1 className="signUp__heading">Become an Asgardian</h1>
        <form className="signUp__form" onSubmit={this.handleSubmit}>
          <label className="signUp__label">First Name</label>
          <input
            className="signUp__input"
            type="text"
            name="first_name"
            placeholder="Freya"
            onChange={this.handleChange}
          />
          <label className="signUp__label">Last Name</label>
          <input
            className="signUp__input"
            type="text"
            placeholder="Østevik"
            name="last_name"
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
