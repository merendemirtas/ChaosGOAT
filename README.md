# Kintsugi Monkey Banking Backend

Kintsugi Monkey Banking is a hackathon chaos engineering demo for a banking microservice system. The backend intentionally breaks `fraud-check-service`, records the blast radius in SQLite, and generates developer-facing repair guidance called Golden Trace through Gemini or a deterministic fallback analyzer.

This setup is intentionally demo-focused:

- React + Vite frontend dashboard
- Node.js + Express microservices
- SQLite persistence
- Docker Compose for all backend services
- Gemini API used only from backend
- Safe banking degradation when fraud checks are unavailable
- Docker socket mount for chaos control in the demo only

## File Structure

```text
.
├── backend
│   ├── account-service
│   ├── fraud-check-service
│   ├── kintsugi-monkey-api
│   ├── notification-service
│   └── transaction-service
├── frontend
├── docker-compose.yml
├── prompt.md
└── README.md
```

## Services and Ports

- `frontend` on `5173`
- `kintsugi-monkey-api` on `4000`
- `account-service` on `4001`
- `transaction-service` on `4002`
- `fraud-check-service` on `4003`
- `notification-service` on `4004`

## How To Run

1. Optionally export a Gemini key:

```bash
export GEMINI_API_KEY=your_key_here
export GEMINI_MODEL=gemini-2.5-flash
```

2. Start the full stack:

```bash
docker compose up --build
```

If `GEMINI_API_KEY` is not set or Gemini fails, the fallback analyzer still works and Golden Trace generation continues.

## Docker Note

`kintsugi-monkey-api` mounts `/var/run/docker.sock:/var/run/docker.sock` so it can run `docker stop` and `docker start` against the fraud service during the chaos demo. This is for hackathon demonstration only and should not be used as-is in production.

## Endpoint List

### `frontend` (`5173`)

- Dashboard served by Vite preview
- Uses `VITE_API_BASE_URL=http://localhost:4000`

### `kintsugi-monkey-api` (`4000`)

- `GET /health/services`
- `POST /banking/demo-transaction`
- `POST /experiments/kill-fraud-check`
- `POST /experiments/recover-fraud-check`
- `POST /experiments/:id/analyze`
- `GET /experiments`
- `GET /experiments/:id`
- `GET /golden-traces`
- `GET /golden-traces/:id`

### `account-service` (`4001`)

- `GET /health`
- `GET /accounts/1`

### `transaction-service` (`4002`)

- `GET /health`
- `POST /transactions/demo`

### `fraud-check-service` (`4003`)

- `GET /health`
- `POST /fraud/check`

### `notification-service` (`4004`)

- `GET /health`
- `POST /notify`

## Test Commands

```bash
curl http://localhost:4000/health/services

curl -X POST http://localhost:4000/banking/demo-transaction

curl -X POST http://localhost:4000/experiments/kill-fraud-check

curl -X POST http://localhost:4000/experiments/recover-fraud-check

curl http://localhost:4000/experiments

curl -X POST http://localhost:4000/experiments/<EXPERIMENT_ID>/analyze

curl http://localhost:4000/golden-traces
```

## Demo Flow

1. Run `docker compose up --build`.
2. Open `http://localhost:5173`.
3. Use the dashboard to refresh health and confirm all services are healthy.
4. Run a demo transaction and verify the normal approved banking path.
5. Break `fraud-check-service` and sample degraded transaction behavior.
6. Recover the dependency and close the experiment.
7. Analyze the latest experiment to create a Golden Trace from Gemini or the fallback analyzer.
8. Use the history panels or REST endpoints to review stored resilience learnings.

## Notes For Frontend Teammate

- Use only `kintsugi-monkey-api` on port `4000`; the frontend should not call internal services directly.
- `POST /banking/demo-transaction` returns either an approved response or a safe degraded fallback with `status: "pending_manual_review"` and `degraded: true`.
- `GET /health/services` is the best dashboard bootstrap endpoint for service cards and status chips.
- `GET /experiments/:id` returns experiment detail plus `metrics` and `logs` for drill-down views.
- `POST /experiments/:id/analyze` returns the saved Golden Trace payload and an `analyzer` field showing `gemini` or `fallback`.
- Gemini API keys stay backend-only and must never be requested from the browser.
