import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AdminAuthProvider } from "./admin/AdminAuthContext.jsx";
import "./reset.scss";
import "./App.scss";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AdminAuthProvider>
      <App />
    </AdminAuthProvider>
  </BrowserRouter>
);
