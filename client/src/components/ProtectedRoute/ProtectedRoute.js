import React from "react";
import { Route, Redirect } from "react-router-dom";
import HomePage from "../../pages/HomePage/HomePage";

const ProtectedRoute = ({ component: Component, ...rest }) => {
  const token = sessionStorage.getItem("token");
  //return a Route that contains all reactRouterProps to render a specific page depending if there is a valid token or not.
  return (
    <Route
      {...rest}
      render={(routeProps) =>
        //If there is no token, rediect to login page. If there is a valid token take the user to the HomePage.
        !token ? <Redirect to="/login" /> : <HomePage {...routeProps} />
      }
    />
  );
};

export default ProtectedRoute;
