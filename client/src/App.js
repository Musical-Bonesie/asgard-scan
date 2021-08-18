import "./App.scss";
import { BrowserRouter, Route, Switch } from "react-router-dom";
import Header from "./components/Header/index";
import HomePage from "./pages/HomePage/index";
import Login from "./pages/Login/index";
import SignUp from "./pages/SignUp";
import NoSensitivity from "./components/NoSensitivity/NoSensitivity";
import YesSensitivity from "./components/YesSensitivity/YesSensitivity";

function App() {
  /// sessionStorage.
  return (
    <div className="App">
      <BrowserRouter>
        <Header />
        <Switch>
          <Route path="/" exact component={HomePage} />
          <Route path="/asgardscan" exact component={HomePage} />
          <Route path="/asgardscan/:userID" exact component={NoSensitivity} />
          <Route path="/asgardscan/:userID" exact component={YesSensitivity} />
          <Route path="/login" exact component={Login} />
          <Route path="/signup" exact component={SignUp} />
          {/* <ProtectedRoute to="/" exact component={HomePage} /> */}
        </Switch>
      </BrowserRouter>
    </div>
  );
}

export default App;
