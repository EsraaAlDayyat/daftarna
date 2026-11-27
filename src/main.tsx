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
  navigator.serviceWorker.register("/sw.js").then((r) => r.update()).catch(() => {});
  // A new version took over: reload once so the screen shows it
  // (not on the very first visit, when there was no older version)
  const hadOld = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadOld) return;
    reloaded = true;
    location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
