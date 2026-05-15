import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Gauge,
  Gem,
  HeartPulse,
  History,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Split,
  Wrench,
  Zap,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

const SERVICE_NAMES = [
  "account-service",
  "transaction-service",
  "fraud-check-service",
  "notification-service",
];

const EMPTY_TRACE = {
  summary: "-",
  suspected_weak_point: "-",
  blast_radius: "-",
  risk_level: "-",
  safe_degradation_review: "-",
  developer_recommendations: [],
  next_experiments: [],
  kintsugi_lesson: "-",
};

function getList(payload, keys) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function getExperimentId(experiment) {
  if (!experiment || typeof experiment !== "object") {
    return "";
  }

  return experiment.id || experiment.experiment_id || experiment._id || "";
}

function findExperiment(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.experiment && typeof payload.experiment === "object") {
    return payload.experiment;
  }

  if (payload.latest_experiment && typeof payload.latest_experiment === "object") {
    return payload.latest_experiment;
  }

  if (payload.id || payload.experiment_id || payload.target_service) {
    return payload;
  }

  const experiments = getList(payload, ["experiments", "items", "data"]);
  return pickLatestExperiment(experiments);
}

function parseTime(value) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickLatestExperiment(experiments) {
  if (!experiments.length) {
    return null;
  }

  const dated = [...experiments].sort((a, b) => {
    const bTime = Math.max(
      parseTime(b.started_at),
      parseTime(b.ended_at),
      parseTime(b.created_at),
      parseTime(b.timestamp),
    );
    const aTime = Math.max(
      parseTime(a.started_at),
      parseTime(a.ended_at),
      parseTime(a.created_at),
      parseTime(a.timestamp),
    );

    return bTime - aTime;
  });

  return dated[0] || experiments[0];
}

function summarizeMetrics(metrics) {
  if (!Array.isArray(metrics) || !metrics.length) {
    return [];
  }

  const failedRequests = metrics.reduce(
    (sum, metric) => sum + Number(metric.failed_requests || 0),
    0,
  );
  const degradedRequests = metrics.reduce(
    (sum, metric) => sum + Number(metric.degraded_count || 0),
    0,
  );
  const averageLatencyMs = Number(
    (
      metrics.reduce((sum, metric) => sum + Number(metric.latency_ms || 0), 0) /
      metrics.length
    ).toFixed(2),
  );
  const fallbackUsed = metrics.some((metric) => {
    const value = metric.fallback_used;
    return value === true || value === 1 || value === "1";
  });

  return [
    ["failed_requests", failedRequests],
    ["degraded_requests", degradedRequests],
    ["fallback_used", fallbackUsed],
    ["average_latency_ms", averageLatencyMs],
  ];
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusClass(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "UP" || normalized === "LOW" || normalized === "APPROVED") {
    return "is-up";
  }

  if (
    normalized === "DEGRADED" ||
    normalized === "MEDIUM" ||
    normalized === "PENDING_MANUAL_REVIEW"
  ) {
    return "is-degraded";
  }

  if (normalized === "DOWN" || normalized === "HIGH" || normalized === "FAILED") {
    return "is-down";
  }

  return "is-unknown";
}

function getServiceStatus(services, name) {
  return (
    services.find((service) => service.name === name)?.status ||
    "UNKNOWN"
  );
}

function SectionTitle({ icon: Icon, eyebrow, title, children }) {
  return (
    <div className="section-title">
      <div className="title-lockup">
        {Icon ? (
          <span className="title-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        ) : null}
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatusPill({ value }) {
  return (
    <span className={`status-pill ${statusClass(value)}`}>
      <span className="status-dot" />
      {formatValue(value)}
    </span>
  );
}

function DetailRow({ label, value, date }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{date ? formatDate(value) : formatValue(value)}</strong>
    </div>
  );
}

function DataChip({ label, value }) {
  return (
    <div className="data-chip">
      <span>{label}</span>
      <strong>{formatValue(value)}</strong>
    </div>
  );
}

function App() {
  const [services, setServices] = useState(
    SERVICE_NAMES.map((name) => ({ name, status: "UNKNOWN" })),
  );
  const [healthTimestamp, setHealthTimestamp] = useState("");
  const [experiments, setExperiments] = useState([]);
  const [latestExperimentOverride, setLatestExperimentOverride] = useState(null);
  const [latestExperimentDetail, setLatestExperimentDetail] = useState(null);
  const [goldenTraces, setGoldenTraces] = useState([]);
  const [activeTrace, setActiveTrace] = useState(null);
  const [transactionResult, setTransactionResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState({
    health: false,
    transaction: false,
    break: false,
    recover: false,
    analyze: false,
  });

  const latestExperimentSummary = useMemo(
    () => latestExperimentOverride || pickLatestExperiment(experiments),
    [experiments, latestExperimentOverride],
  );
  const latestExperiment =
    getExperimentId(latestExperimentDetail) ===
    getExperimentId(latestExperimentSummary)
      ? latestExperimentDetail
      : latestExperimentSummary;

  const fraudStatus = getServiceStatus(services, "fraud-check-service");
  const transactionStatus = getServiceStatus(services, "transaction-service");
  const fraudIsDown = String(fraudStatus).toUpperCase() === "DOWN";
  const transactionIsDegraded =
    String(transactionStatus).toUpperCase() === "DEGRADED";
  const visibleTrace = activeTrace || goldenTraces[0] || EMPTY_TRACE;

  const apiFetch = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      ...options,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload?.message
          ? payload.message
          : `Request failed with ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }, []);

  const runTask = useCallback(async (key, task, options = {}) => {
    setLoading((current) => ({ ...current, [key]: true }));
    if (!options.keepError) {
      setErrorMessage("");
    }

    try {
      return await task();
    } catch (error) {
      const cleanMessage =
        error instanceof TypeError
          ? `Backend unavailable at ${API_BASE_URL}`
          : error.message || "Unexpected frontend error";
      setErrorMessage(cleanMessage);
      return null;
    } finally {
      setLoading((current) => ({ ...current, [key]: false }));
    }
  }, []);

  const refreshHealth = useCallback(
    async (options = {}) => {
      return runTask(
        "health",
        async () => {
          const payload = await apiFetch("/health/services");
          const nextServices = getList(payload, ["services"]).length
            ? getList(payload, ["services"])
            : SERVICE_NAMES.map((name) => ({ name, status: "UNKNOWN" }));

          setServices(nextServices);
          setHealthTimestamp(payload.timestamp || new Date().toISOString());
          return payload;
        },
        options,
      );
    },
    [apiFetch, runTask],
  );

  const refreshExperiments = useCallback(async () => {
    return runTask("health", async () => {
      const payload = await apiFetch("/experiments");
      const nextExperiments = getList(payload, ["experiments", "items", "data"]);
      setExperiments(nextExperiments);
      setLatestExperimentOverride(null);
      return payload;
    });
  }, [apiFetch, runTask]);

  const refreshGoldenTraces = useCallback(async () => {
    return runTask("health", async () => {
      const payload = await apiFetch("/golden-traces");
      const traces = getList(payload, ["golden_traces", "traces", "items", "data"]);
      setGoldenTraces(traces);
      return payload;
    });
  }, [apiFetch, runTask]);

  const refreshExperimentDetail = useCallback(
    async (experiment) => {
      const experimentId = getExperimentId(experiment);

      if (!experimentId) {
        setLatestExperimentDetail(null);
        return null;
      }

      return runTask(
        "health",
        async () => {
          const detail = await apiFetch(
            `/experiments/${encodeURIComponent(experimentId)}`,
          );
          setLatestExperimentDetail(detail);
          return detail;
        },
        { keepError: true },
      );
    },
    [apiFetch, runTask],
  );

  useEffect(() => {
    refreshHealth({ keepError: true });
    refreshExperiments();
    refreshGoldenTraces();

    const intervalId = window.setInterval(() => {
      refreshHealth({ keepError: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [refreshExperiments, refreshGoldenTraces, refreshHealth]);

  useEffect(() => {
    const summaryId = getExperimentId(latestExperimentSummary);
    const detailId = getExperimentId(latestExperimentDetail);

    if (!summaryId) {
      setLatestExperimentDetail(null);
      return;
    }

    if (summaryId !== detailId) {
      refreshExperimentDetail(latestExperimentSummary);
    }
  }, [latestExperimentDetail, latestExperimentSummary, refreshExperimentDetail]);

  const runDemoTransaction = async () => {
    const payload = await runTask("transaction", async () =>
      apiFetch("/banking/demo-transaction", { method: "POST" }),
    );

    if (payload) {
      setTransactionResult(payload);
      refreshHealth({ keepError: true });
    }
  };

  const breakFraudCheck = async () => {
    const payload = await runTask("break", async () =>
      apiFetch("/experiments/kill-fraud-check", { method: "POST" }),
    );

    if (payload) {
      const experiment = findExperiment(payload);
      if (experiment) {
        setLatestExperimentOverride(experiment);
      }
      await refreshHealth({ keepError: true });
      await refreshExperiments();
    }
  };

  const recoverFraudCheck = async () => {
    const payload = await runTask("recover", async () =>
      apiFetch("/experiments/recover-fraud-check", { method: "POST" }),
    );

    if (payload) {
      const experiment = findExperiment(payload);
      if (experiment) {
        setLatestExperimentOverride(experiment);
      }
      await refreshHealth({ keepError: true });
      await refreshExperiments();
    }
  };

  const analyzeLastExperiment = async () => {
    const experimentId =
      latestExperiment?.id || latestExperiment?.experiment_id || latestExperiment?._id;

    if (!experimentId) {
      setErrorMessage("No latest experiment id available for Gemini Analysis.");
      return;
    }

    const payload = await runTask("analyze", async () =>
      apiFetch(`/experiments/${encodeURIComponent(experimentId)}/analyze`, {
        method: "POST",
      }),
    );

    if (payload) {
      setActiveTrace(payload);
      await refreshGoldenTraces();
      await refreshExperiments();
    }
  };

  const experimentFields = [
    ["id", latestExperiment?.id],
    ["domain", latestExperiment?.domain],
    ["target_service", latestExperiment?.target_service],
    ["affected_service", latestExperiment?.affected_service],
    ["fault_type", latestExperiment?.fault_type],
    ["status", latestExperiment?.status],
    ["started_at", latestExperiment?.started_at, true],
    ["ended_at", latestExperiment?.ended_at, true],
    ["recovery_time_ms", latestExperiment?.recovery_time_ms],
    ["safe_degradation", latestExperiment?.safe_degradation],
  ];

  const metricFields = [
    "failed_requests",
    "degraded_requests",
    "fallback_used",
    "average_latency_ms",
    "recovery_time_ms",
  ];

  const summarizedMetrics = summarizeMetrics(latestExperiment?.metrics);
  const availableMetrics = metricFields
    .map((key) => [key, latestExperiment?.[key]])
    .filter(([, value]) => value !== undefined && value !== null);

  const fallbackMetricEntries =
    availableMetrics.length > 0
      ? availableMetrics
      : summarizedMetrics.length
        ? summarizedMetrics
        : Object.entries(latestExperiment?.metrics || {}).slice(0, 8);

  const recommendations = Array.isArray(visibleTrace.developer_recommendations)
    ? visibleTrace.developer_recommendations
    : [];
  const nextExperiments = Array.isArray(visibleTrace.next_experiments)
    ? visibleTrace.next_experiments
    : [];

  return (
    <div className="app-shell">
      <div className="background-crack" aria-hidden="true" />

      <header className="hero-section">
        <div className="hero-copy">
          <span className="project-mark">
            <Gem size={16} />
            Fracture Memory Dashboard
          </span>
          <h1>Kintsugi Monkey Banking</h1>
          <p className="subtitle">Safe chaos for resilient banking systems.</p>
          <p className="slogan">Break safely. Learn visibly. Repair stronger.</p>
          <p className="hero-description">
            Controlled chaos experiments that transform banking service failures
            into Golden Traces.
          </p>
        </div>

        <div className="hero-status" aria-label="Resilience Memory status">
          <div className="hero-orbit">
            <Banknote size={34} />
            <span />
            <span />
          </div>
          <div>
            <span>Resilience Memory</span>
            <strong>{goldenTraces.length}</strong>
            <small>Golden Trace records</small>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <main className="dashboard-grid">
        <section className="panel system-panel wide-panel">
          <SectionTitle
            icon={Split}
            eyebrow="Banking System Map"
            title="Service Topology"
          >
            <div className="timestamp">
              <Clock3 size={14} />
              {healthTimestamp ? formatDate(healthTimestamp) : "-"}
            </div>
          </SectionTitle>

          <div className="service-map">
            <div className="service-row">
              {services.map((service) => (
                <article
                  className={`service-card ${statusClass(service.status)}`}
                  key={service.name}
                >
                  <div className="service-icon">
                    {service.name.includes("fraud") ? (
                      <ShieldCheck size={20} />
                    ) : service.name.includes("transaction") ? (
                      <Banknote size={20} />
                    ) : (
                      <Activity size={20} />
                    )}
                  </div>
                  <h3>{service.name}</h3>
                  <StatusPill value={service.status} />
                  {service.name === "transaction-service" &&
                  transactionIsDegraded ? (
                    <span className="fallback-badge">Pending Manual Review</span>
                  ) : null}
                </article>
              ))}
            </div>

            <div
              className={`dependency-line ${fraudIsDown ? "is-cracked" : ""}`}
              aria-label="transaction-service to fraud-check-service dependency"
            >
              <span>transaction-service</span>
              <div className="line-track">
                {fraudIsDown ? <i className="gold-crack" /> : null}
              </div>
              <span>fraud-check-service</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <SectionTitle
            icon={Banknote}
            eyebrow="Banking Demo Transaction Panel"
            title="Transaction Flow"
          />

          <button
            className="primary-action"
            type="button"
            onClick={runDemoTransaction}
            disabled={loading.transaction}
          >
            <Zap size={18} />
            {loading.transaction ? "Running..." : "Run Demo Transaction"}
          </button>

          <div className="transaction-result">
            <DetailRow
              label="transactionId"
              value={transactionResult?.transactionId}
            />
            <DetailRow label="status" value={transactionResult?.status} />
            <DetailRow label="message" value={transactionResult?.message} />
            <DetailRow
              label="fraudCheckStatus"
              value={transactionResult?.fraudCheckStatus}
            />
          </div>

          {transactionResult?.status === "pending_manual_review" ? (
            <div className="safe-degradation-callout">
              <ShieldCheck size={18} />
              Safe Degradation Activated
            </div>
          ) : null}
        </section>

        <section className="panel">
          <SectionTitle
            icon={FlaskConical}
            eyebrow="Chaos Controls"
            title="Experiment Actions"
          />

          <div className="control-grid">
            <button
              className="control-button"
              type="button"
              onClick={() => refreshHealth()}
              disabled={loading.health}
            >
              <RefreshCw size={17} />
              Refresh Health
            </button>
            <button
              className="control-button danger"
              type="button"
              onClick={breakFraudCheck}
              disabled={loading.break}
            >
              <AlertTriangle size={17} />
              Break fraud-check-service
            </button>
            <button
              className="control-button success"
              type="button"
              onClick={recoverFraudCheck}
              disabled={loading.recover}
            >
              <HeartPulse size={17} />
              Recover fraud-check-service
            </button>
            <button
              className="control-button gold"
              type="button"
              onClick={analyzeLastExperiment}
              disabled={loading.analyze || !latestExperiment}
            >
              <BrainCircuit size={17} />
              Analyze Last Experiment
            </button>
          </div>
        </section>

        <section className="panel">
          <SectionTitle
            icon={History}
            eyebrow="Latest Experiment Panel"
            title="Latest Fault"
          />

          <div className="details-stack">
            {experimentFields.map(([label, value, date]) => (
              <DetailRow key={label} label={label} value={value} date={date} />
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionTitle
            icon={Gauge}
            eyebrow="Metrics / Impact Panel"
            title="Blast Signals"
          />

          <div className="metrics-grid">
            {fallbackMetricEntries.length ? (
              fallbackMetricEntries.map(([label, value]) => (
                <DataChip key={label} label={label} value={value} />
              ))
            ) : (
              <div className="empty-state">No metrics returned yet.</div>
            )}
          </div>
        </section>

        <section className="panel trace-panel wide-panel">
          <SectionTitle
            icon={BrainCircuit}
            eyebrow="Golden Trace Panel"
            title="Gemini Analysis"
          >
            <StatusPill value={visibleTrace.risk_level} />
          </SectionTitle>

          <div className="trace-grid">
            <article className="trace-block">
              <span>Summary</span>
              <p>{formatValue(visibleTrace.summary)}</p>
            </article>
            <article className="trace-block">
              <span>Suspected Weak Point</span>
              <p>{formatValue(visibleTrace.suspected_weak_point)}</p>
            </article>
            <article className="trace-block">
              <span>Blast Radius</span>
              <p>{formatValue(visibleTrace.blast_radius)}</p>
            </article>
            <article className="trace-block">
              <span>Safe Degradation Review</span>
              <p>{formatValue(visibleTrace.safe_degradation_review)}</p>
            </article>
          </div>

          <div className="recommendation-layout">
            <div>
              <h3>Developer Recommendations</h3>
              <ul className="check-list">
                {recommendations.length ? (
                  recommendations.map((item, index) => (
                    <li key={`${item}-${index}`}>
                      <CheckCircle2 size={17} />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <CheckCircle2 size={17} />
                    <span>-</span>
                  </li>
                )}
              </ul>
            </div>

            <div>
              <h3>Next Experiments</h3>
              <ul className="spark-list">
                {nextExperiments.length ? (
                  nextExperiments.map((item, index) => (
                    <li key={`${item}-${index}`}>
                      <Sparkles size={16} />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <Sparkles size={16} />
                    <span>-</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <article className="kintsugi-lesson">
            <Wrench size={18} />
            <div>
              <span>Kintsugi Lesson</span>
              <p>{formatValue(visibleTrace.kintsugi_lesson)}</p>
            </div>
          </article>
        </section>

        <section className="panel history-panel">
          <SectionTitle
            icon={History}
            eyebrow="Experiment History"
            title="Fracture Memory"
          />

          <div className="history-list">
            {experiments.length ? (
              experiments.map((experiment, index) => (
                <article className="history-item" key={experiment.id || index}>
                  <div>
                    <strong>{formatValue(experiment.id)}</strong>
                    <span>
                      {formatValue(experiment.target_service)} ·{" "}
                      {formatValue(experiment.fault_type)}
                    </span>
                  </div>
                  <StatusPill value={experiment.status} />
                </article>
              ))
            ) : (
              <div className="empty-state">No experiments recorded yet.</div>
            )}
          </div>
        </section>

        <section className="panel history-panel">
          <SectionTitle
            icon={Gem}
            eyebrow="Golden Trace History"
            title="Resilience Memory"
          />

          <div className="history-list">
            {goldenTraces.length ? (
              goldenTraces.map((trace, index) => (
                <article
                  className="history-item trace-history-item"
                  key={trace.id || index}
                >
                  <div>
                    <strong>{formatValue(trace.id)}</strong>
                    <span>{formatValue(trace.summary)}</span>
                  </div>
                  <StatusPill value={trace.risk_level} />
                </article>
              ))
            ) : (
              <div className="empty-state">No Golden Trace records yet.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
