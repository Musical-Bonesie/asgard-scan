import React from "react";
import { createRoot } from "react-dom/client";
import "./index.scss";
import App from "./App";

// React 18 removed ReactDOM.render in favour of createRoot.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
