import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
// Bundled (not from the internet) so Manipuri lyrics in Meitei Mayek or Bengali script show properly, even offline.
import "@fontsource/noto-sans-meetei-mayek/meetei-mayek-400.css";
import "@fontsource/noto-sans-meetei-mayek/meetei-mayek-600.css";
import "@fontsource/noto-sans-bengali/bengali-400.css";
import "@fontsource/noto-sans-bengali/bengali-600.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
