import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/reem-kufi/arabic-500.css";
import "@fontsource/reem-kufi/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "./styles.css";
import App from "./App";
import { applyTheme } from "./ui/theme";

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";
applyTheme();

if ("serviceWorker" in navigator && import.meta.env.PROD && !import.meta.env.VITE_NO_SW) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
