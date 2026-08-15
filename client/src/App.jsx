import "./App.scss";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Header from "./components/Header/index";
import HomePage from "./pages/HomePage/index";
import Login from "./pages/Login/index";
import SignUp from "./pages/SignUp";
import NoSensitivity from "./components/NoSensitivity/NoSensitivity";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";

// react-router v6/v7: <Switch> is now <Routes>, `component=` is now
// `element=`, and `exact` is the default.
function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Header />
        <Routes>
          {/* NOTE: the original also declared "/asgardscan/:userID" a second
              time for YesSensitivity. Two routes cannot share a path -- the
              second never matched, so it has been dropped rather than
              silently changing which component renders here. */}
          <Route path="/asgardscan/:userID" element={<NoSensitivity />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

          {/* ProtectedRoute is a layout route: it renders an <Outlet /> when a
              token is present and redirects to /login when it is not. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/asgardscan" element={<HomePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
