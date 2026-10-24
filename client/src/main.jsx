import React from "react";import {createRoot} from "react-dom/client";import {BrowserRouter} from "react-router-dom";
import "@fontsource-variable/inter";import "@fontsource-variable/fraunces";import "./index.css";import App from "./App.jsx";import {AuthProvider} from "./auth.jsx";import {ToastProvider} from "./ui.jsx";
createRoot(document.getElementById("root")).render(<BrowserRouter><ToastProvider><AuthProvider><App/></AuthProvider></ToastProvider></BrowserRouter>);
