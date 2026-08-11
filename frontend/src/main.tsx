import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { AuthProvider } from "./app/AuthProvider";
import "./common/styles/tokens.css";
import "./common/styles/global.css";
import "./common/styles/forms.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></StrictMode>,
);
