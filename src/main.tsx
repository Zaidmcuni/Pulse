/**
 * Owner: Mohamed (Step 0)
 * Purpose: App entry point; initializes store before rendering React
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { accounts } from "./auth/accounts";
import { store } from "./data/store";
import "./index.css";

async function bootstrap(): Promise<void> {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Root element #root not found");
  }
  const root = createRoot(rootEl);

  try {
    await store.init();
    const signedInId = accounts.signedInProfileId();
    if (signedInId) store.setActiveProfile(signedInId);
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown initialization error";
    root.render(
      <main className="app-main" role="alert">
        <section className="card" style={{ maxWidth: 560, margin: "2rem auto" }}>
          <h1 style={{ marginTop: 0 }}>Unable to start PULSE</h1>
          <p style={{ color: "var(--pulse-muted)", marginBottom: 0 }}>
            App data failed to initialize ({message}). Reload the page to try again.
          </p>
        </section>
      </main>,
    );
  }
}

void bootstrap();
