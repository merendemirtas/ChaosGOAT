# Kintsugi Monkey Banking

Kintsugi Monkey Banking is a hackathon chaos engineering playground for a banking microservice system. It now includes chained service dependencies, multiple chaos methods, deterministic risk scoring, and Gemini-based incident analysis.

## Architecture

Service chains:

- `transaction-service -> limit-service -> account-service`
- `transaction-service -> beneficiary-service -> account-service`
- `transaction-service -> compliance-service -> account-service`
- `transaction-service -> fraud-check-service -> risk-profile-service`
- `transaction-service -> notification-service`

Service inventory:

- `frontend` on `5173`
- `kintsugi-monkey-api` on `4000`
- `account-service` on `4001`
- `transaction-service` on `4002`
- `fraud-check-service` on `4003`
- `notification-service` on `4004`
- `risk-profile-service` on `4005`
- `limit-service` on `4006`
- `beneficiary-service` on `4007`
- `compliance-service` on `4008`

## Supported Chaos Methods

Implemented and testable in this repo:

- `service_kill`
- `network_delay`
- `packet_loss`
- `cpu_stress`
- `memory_stress`
- `db_disconnect`
- `cache_disconnect`
- `traffic_surge`
- `partial_failure`

These are implemented in a demo-safe way:

- `service_kill` uses Docker stop/start
- `network_delay`, `packet_loss`, `cpu_stress`, `memory_stress`, and `partial_failure` are injected at the service layer
- `db_disconnect` is simulated in `account-service`
- `cache_disconnect` is simulated in `risk-profile-service`
- `traffic_surge` is executed by concurrent transaction bursts from `kintsugi-monkey-api`
- `experiments/run` supports `target_services`, so one run can break several services at the same time

## Risk Model

Risk is scored numerically and categorized as `LOW`, `MEDIUM`, or `HIGH`.

The UI shows:

- per-metric percentage bars
- normalized metric scores
- final total risk score
- final risk level
- a dedicated `simultaneous_targets` metric so multi-service failures are penalized faster

Detailed methodology and weights:

- [docs/RISK_MODEL.md](/Users/efe/Desktop/GOATSkintsugimonkey/docs/RISK_MODEL.md)

## Gemini Output

- Gemini runs only on the backend.
- If Gemini fails, deterministic fallback analysis is used.
- Translation was intentionally deferred so the stack stays lean and quick to rebuild.
- Golden Trace now focuses on summary, weak point, blast radius, risk reasoning, safe degradation review, and developer recommendations.

## How To Run

Set environment values if needed:

```bash
export GEMINI_API_KEY=your_key_here
export GEMINI_MODEL=gemini-2.5-flash
```

Start the full stack:

```bash
docker compose up --build
```

Open:

- Frontend: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:4000](http://localhost:4000)

Stop:

```bash
docker compose down
```

## Important Demo Note

`kintsugi-monkey-api` mounts `/var/run/docker.sock:/var/run/docker.sock` so it can stop and start containers during chaos experiments. This is strictly for demo purposes and must not be used as-is in production.

## Key Endpoints

### Frontend

- `GET /` on port `5173`

### Main API

- `GET /health/services`
- `GET /topology`
- `GET /chaos/methods`
- `POST /banking/demo-transaction`
  Body may include `count` and `concurrency`.
- `POST /experiments/run`
- `POST /experiments/recover`
- `POST /experiments/:id/analyze`
- `GET /experiments`
- `GET /experiments/:id`
- `GET /golden-traces`
- `GET /golden-traces/:id`

### Internal Services

- `account-service`
  - `GET /health`
  - `GET /accounts/1`
  - `POST /chaos/configure`
  - `POST /chaos/reset`
- `limit-service`
  - `GET /health`
  - `POST /limits/check`
  - `POST /chaos/configure`
  - `POST /chaos/reset`
- `fraud-check-service`
  - `GET /health`
  - `POST /fraud/check`
  - `POST /chaos/configure`
  - `POST /chaos/reset`
- `risk-profile-service`
  - `GET /health`
  - `GET /risk-profile/:accountId`
  - `POST /chaos/configure`
  - `POST /chaos/reset`
- `beneficiary-service`
  - `GET /health`
  - `POST /beneficiaries/validate`
  - `POST /chaos/configure`
  - `POST /chaos/reset`
- `compliance-service`
  - `GET /health`
  - `POST /compliance/check`
  - `POST /chaos/configure`
  - `POST /chaos/reset`
- `notification-service`
  - `GET /health`
  - `POST /notify`

## Quick Test Flow

Health:

```bash
curl http://localhost:4000/health/services
```

Normal transaction:

```bash
curl -X POST http://localhost:4000/banking/demo-transaction \
  -H "Content-Type: application/json" \
  -d '{ "count": 5, "concurrency": 2 }'
```

Run a delay experiment:

```bash
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{
    "target_service": "fraud-check-service",
    "chaos_method": "network_delay",
    "config": { "latencyMs": 1800, "requestCount": 8 }
  }'
```

Recover the running experiment:

```bash
curl -X POST http://localhost:4000/experiments/recover \
  -H "Content-Type: application/json" \
  -d '{}'
```

Run a traffic surge:

```bash
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{
    "target_service": "transaction-service",
    "chaos_method": "traffic_surge",
    "config": { "requestCount": 16, "concurrency": 4 }
  }'
```

Analyze:

```bash
curl -X POST http://localhost:4000/experiments/<EXPERIMENT_ID>/analyze
```

Golden traces:

```bash
curl http://localhost:4000/golden-traces
```

## Frontend Notes

- The frontend calls only `kintsugi-monkey-api`.
- The topology panel reflects actual dependency chains from `/topology`.
- The chaos control panel is driven by `/chaos/methods`.
- Risk bars are driven by deterministic `risk_metrics`.
- Transaction count is selectable from the dashboard.
- Multiple target services can be selected in the chaos form.
- Golden Trace text currently returns in English.
