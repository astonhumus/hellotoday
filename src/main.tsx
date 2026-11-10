import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
// Bundled (not from the internet) so Manipuri lyrics in Meitei Mayek or Bengali script show properly, even offline.
import "@fontsource/noto-sans-meetei-mayek/meetei-mayek-400.css";
import "@fontsource/noto-sans-meetei-mayek/meetei-mayek-600.css";
import "@fontsource/noto-sans-bengali/bengali-400.css";
import "@fontsource/noto-sans-bengali/bengali-600.css";
// The one UI typeface (bundled, so it works offline); the Noto fonts above take over for Meitei Mayek and Bengali.
import "@fontsource-variable/inter/wght.css";
import "./styles/tokens.css";
import "./styles.css";
import "./ui/ui.css";
import { applyTheme } from "./lib/theme";

import { applyPrefs } from "./lib/prefs";
applyPrefs();
applyTheme(); // the saved light/dark choice, before anything is drawn

createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
