import "@fontsource/rubik/arabic-400.css";
import "@fontsource/rubik/arabic-500.css";
import "@fontsource/rubik/arabic-700.css";
import "@fontsource/rubik/latin-400.css";
import "@fontsource/rubik/latin-500.css";
import "@fontsource/rubik/latin-700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { applyTheme } from "./ui/theme";
import { captureInvite } from "./ui/invite";

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";
applyTheme();
captureInvite();

if ("serviceWorker" in navigator && import.meta.env.PROD && !import.meta.env.VITE_NO_SW) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
