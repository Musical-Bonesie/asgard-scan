import React from "react";
import { Route, Redirect } from "react-router-dom";

const ProtectedRoute = ({ component: Component, ...rest }) => {
  //had reactRouterProps instead of ...rest --> means its just spreading an object but Cece choose reactRouterProps to show
  // token is inside of sessionSotrage is user has logged in
  const token = sessionStorage.getItem("token");
  //return a Route that contains all of the REACT router props.
  return (
    <Route
      //here she also had {...reactRouterProps} -->
      {...rest}
      render={(routeProps) =>
        //inside of this callbackFunc is going to check to see if there is a token in sessionStorage or not. if it has we'll do something if not redirct
        !token ? <Redirect to="/login" /> : <Component {...routeProps} />
      }
    />
  );
};

export default ProtectedRoute;
