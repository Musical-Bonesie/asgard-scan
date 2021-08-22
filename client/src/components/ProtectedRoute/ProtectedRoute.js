import React from "react";
import { Route, Redirect } from "react-router-dom";
import HomePage from "../../pages/HomePage/HomePage";

//create a route so only valid users can access the HomePage.
// ...rest gives access to token inside of sessionStorage if a valid user has logged in.

const ProtectedRoute = ({ component: Component, ...rest }) => {
  const token = sessionStorage.getItem("token");
  //return a Route that contains all reactRouterProps to render a specific page depending if there is a valid token or not.
  return (
    <Route
      {...rest}
      render={(routeProps) =>
        //If there is no token rediect to login page. If there is a valid token take the user to the HomePage.
        !token ? <Redirect to="/login" /> : <HomePage {...routeProps} />
      }
    />
  );
};

export default ProtectedRoute;
