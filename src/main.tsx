import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import { maybeStartThemeAudit } from "./lib/themeAudit";
import "./index.css";

registerServiceWorker();
maybeStartThemeAudit();

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
