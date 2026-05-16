# Kintsugi Monkey Banking Frontend

React + Vite dashboard for the Kintsugi Monkey Banking hackathon demo.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

## Environment

Create or export this value for the frontend runtime:

```bash
VITE_API_BASE_URL=http://localhost:4000
```

The frontend only calls the backend REST API. It does not call Gemini directly and does not store API keys.

## Expected Demo Flow

1. Start the backend on `http://localhost:4000`.
2. Start this frontend with `npm run dev`.
3. Open the Vite local URL in the browser.
4. Use **Refresh Health** to verify service state.
5. Use **Run Demo Transaction** to show the normal banking path.
6. Use **Run Chaos** to inject `service_kill`, `network_delay`, `packet_loss`, `cpu_stress`, `memory_stress`, `db_disconnect`, `cache_disconnect`, `traffic_surge`, or `partial_failure`.
7. Select one or more target services when the chosen chaos method supports multi-target runs.
8. Set the transaction count in the banking panel if you want batched transaction results.
9. Watch service chains and risk bars react in the dashboard.
10. Use **Analyze Last Experiment** to load the **Golden Trace** and Gemini commentary.
11. Use **Recover Experiment** to clear long-running chaos injections.
