# Risk Model

Kintsugi Monkey Banking calculates a deterministic risk score from `0` to `100` before Gemini comments on the incident.

## Output Levels

- `LOW`: score `< 25`
- `MEDIUM`: score `>= 25` and `< 55`
- `HIGH`: score `>= 55`

## Metrics

Each active metric is normalized to a `0-100` scale and multiplied by a weight.

### Positive risk contributors

- `downtime`
  - Weight: `0.16`
  - Measures recovery duration or outage window.
- `criticality`
  - Weight: `0.14`
  - Service importance: `LOW=0.35`, `MEDIUM=0.65`, `HIGH=1.0`
- `blast_radius`
  - Weight: `0.18`
  - Ratio of affected services to total services.
- `failure_rate`
  - Weight: `0.22`
  - Failed requests / total requests.
- `degradation_rate`
  - Weight: `0.14`
  - Degraded requests / total requests.
- `latency_p95`
  - Weight: `0.10`
  - Tail latency normalized against a 1800 ms ceiling.
- `dependency_depth`
  - Weight: `0.08`
  - Maximum impacted chain depth.
- `method_severity`
  - Weight: `0.08`
  - Built-in severity coefficient for the selected chaos method.
- `simultaneous_targets`
  - Weight: `0.10`
  - Adds extra pressure when more than one service is broken in the same run.

### Negative relief contributor

- `safe_degradation_relief`
  - Weight: `-0.03`
  - Lowers final risk when the system stayed safe by moving transactions into manual review or another safe fallback.

## Equation

For all active metrics:

```text
score = clamp(
  ( sum( normalized_metric * weight ) / sum( abs(weight) ) ) * 100,
  0,
  100
)
```

Where:

- `normalized_metric` is on a `0-1` scale before the final `* 100`
- inactive metrics are excluded from both numerator and denominator
- relief metrics use a negative weight

## Why This Model Fits The Project

- It prioritizes critical banking dependencies.
- It penalizes broad blast radius and failed requests more than cosmetic slowdowns.
- It still surfaces latency as an early warning sign.
- It rewards safe degradation so the score reflects resilience, not only breakage.
- It can ignore irrelevant metrics by marking them inactive when they do not apply.

## Example Interpretation

- A short `cache_disconnect` with low blast radius and healthy fallback should usually score `LOW` or low `MEDIUM`.
- A single `service_kill` on `account-service` can now reach `HIGH` because it fans out into `limit-service`, `beneficiary-service`, and `compliance-service`.
- A multi-target `service_kill` such as `account-service + fraud-check-service` should push the score into `HIGH` even faster.
- A `traffic_surge` with no failures but rising tail latency and queueing pressure may land in `MEDIUM`.
