/**
 * Owner: Mohamed (Step 0)
 * Purpose: App entry point; initializes store before rendering React
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { store } from "./data/store";
import "./index.css";

async function bootstrap(): Promise<void> {
  await store.init();
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Root element #root not found");
  }
  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootstrap();
