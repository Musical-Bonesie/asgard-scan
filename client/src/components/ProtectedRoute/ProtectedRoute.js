import React from "react";
import { Route, Redirect } from "react-router-dom";
/// TODO Set this up once DB is set up
const ProtectedRoute = ({ component: Component, ...rest }) => {
  //had { ... reactRouterProps} instead of ...rest --> this shows token that's inside of sessionSotrage if user has logged in.

  const token = sessionStorage.getItem("token");
  //return a Route that contains all of the REACT router props.
  return (
    <Route
      // {...rest }can change to {...reactRouterProps} -->
      {...rest}
      render={(routeProps) =>
        //inside of this callbackFunc it checks to see if there is a token in sessionStorage or not.
        //if there is do something/login, if not redirct.
        !token ? <Redirect to="/login" /> : <Component {...routeProps} />
      }
    />
  );
};

export default ProtectedRoute;
