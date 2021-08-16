import "./App.scss";
import { BrowserRouter, Route, Switch } from "react-router-dom";
import Header from "./components/Header/index";
import HomePage from "./pages/HomePage/index";
import YesProductsList from "./components/YesProductsList/YesProductsList";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Header />
        <Switch>
          <Route path="/" exact component={HomePage} />
          <Route path="/products" exact component={HomePage} />
          <Route path="/yesproducts" exact component={YesProductsList} />
          {/* <Route path ="/login" exact component={Login} /> */}
          {/* <ProtectedRoute to="/" exact component={HomePage} /> */}
        </Switch>
      </BrowserRouter>
    </div>
  );
}

export default App;
