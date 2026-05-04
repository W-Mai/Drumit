import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import {
  registerServiceWorker,
  CONTROLLER_CHANGED_EVENT,
} from "./lib/registerServiceWorker";
import { maybeStartThemeAudit } from "./lib/themeAudit";
import "./index.css";

registerServiceWorker();
maybeStartThemeAudit();

// When the newly-installed SW takes over, the currently loaded JS is
// stale. Reload once so the page boots from the fresh assets.
let reloaded = false;
window.addEventListener(CONTROLLER_CHANGED_EVENT, () => {
  if (reloaded) return;
  reloaded = true;
  window.location.reload();
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
