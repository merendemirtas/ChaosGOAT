import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

function renderFatalError(message) {
  const root = document.getElementById("root");

  if (!root) {
    return;
  }

  root.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;background:#07100f;color:#f6f1e6;padding:24px;font-family:Inter,system-ui,sans-serif;">
      <div style="max-width:840px;width:100%;border:1px solid rgba(255,105,97,.35);background:rgba(80,21,19,.76);padding:20px;border-radius:8px;box-shadow:0 20px 48px rgba(0,0,0,.35);">
        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#ffb4af;">Frontend Runtime Error</div>
        <h1 style="margin:12px 0 8px;font-size:28px;line-height:1.1;">Dashboard could not render.</h1>
        <pre style="white-space:pre-wrap;word-break:break-word;margin:0;color:#ffe7e5;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;">${message}</pre>
      </div>
    </div>
  `;
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("RootErrorBoundary:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell">
          <div className="error-banner" role="alert" style={{ marginTop: 0 }}>
            <span>{this.state.error.message || "Unknown render error"}</span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  if (event.error?.message) {
    renderFatalError(event.error.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason?.message ||
    (typeof event.reason === "string" ? event.reason : "Unhandled promise rejection");
  renderFatalError(reason);
});

try {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>,
  );
} catch (error) {
  renderFatalError(error.message || "Unknown startup error");
}
