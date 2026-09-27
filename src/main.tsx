import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import { createRoot } from "react-dom/client";
import App from "./App";
import Projector from "./Projector";
import "./styles.css";
const mode = new URLSearchParams(location.search).get("output");
createRoot(document.getElementById("root")!).render(
  mode ? <Projector stage={mode === "stage"} /> : <App />,
);
