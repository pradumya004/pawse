/**
 * @file src/main.jsx
 * React entry point — mounts <App/> into #root and loads the pixel-cat styles.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./tokens.css"; // design tokens FIRST — every var() below resolves from here
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
