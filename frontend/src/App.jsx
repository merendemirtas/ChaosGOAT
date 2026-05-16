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
  Split,
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
  "risk-profile-service",
  "limit-service",
  "beneficiary-service",
  "compliance-service",
];

const EMPTY_TRACE = {
  summary: "-",
  chaos_method_classification: "-",
  suspected_weak_point: "-",
  blast_radius: "-",
  risk_level: "-",
  risk_score: 0,
  risk_level_reasoning: "-",
  safe_degradation_review: "-",
  developer_recommendations: [],
  risk_metrics: [],
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
    normalized === "PENDING_MANUAL_REVIEW" ||
    normalized === "PENDING_LIMIT_REVIEW" ||
    normalized === "PENDING_COMPLIANCE_REVIEW" ||
    normalized === "RUNNING"
  ) {
    return "is-degraded";
  }

  if (normalized === "DOWN" || normalized === "HIGH" || normalized === "FAILED") {
    return "is-down";
  }

  return "is-unknown";
}

function getServiceStatus(services, name) {
  return services.find((service) => service.name === name)?.status || "UNKNOWN";
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
  const [topology, setTopology] = useState({ services: [], dependencies: [] });
  const [chaosCatalog, setChaosCatalog] = useState({ methods: [], defaultConfig: {} });
  const [experiments, setExperiments] = useState([]);
  const [latestExperimentOverride, setLatestExperimentOverride] = useState(null);
  const [latestExperimentDetail, setLatestExperimentDetail] = useState(null);
  const [goldenTraces, setGoldenTraces] = useState([]);
  const [activeTrace, setActiveTrace] = useState(null);
  const [transactionResult, setTransactionResult] = useState(null);
  const [transactionForm, setTransactionForm] = useState({
    count: 1,
    concurrency: 1,
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState({
    health: false,
    transaction: false,
    runChaos: false,
    recover: false,
    analyze: false,
  });
  const [chaosForm, setChaosForm] = useState({
    target_services: ["fraud-check-service"],
    chaos_method: "service_kill",
    latencyMs: 1200,
    packetLossRate: 0.35,
    cpuStressMs: 450,
    memoryStressMb: 48,
    partialFailureRate: 0.7,
    requestCount: 12,
    concurrency: 6,
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

  const visibleTrace = activeTrace || goldenTraces[0] || EMPTY_TRACE;
  const riskMetrics =
    (Array.isArray(visibleTrace.risk_metrics) && visibleTrace.risk_metrics.length
      ? visibleTrace.risk_metrics
      : latestExperiment?.risk_metrics) || [];
  const riskScore = Number(visibleTrace.risk_score ?? latestExperiment?.risk_score ?? 0);

  const availableTargets = useMemo(() => {
    const activeMethod = chaosCatalog.methods.find(
      (method) => method.code === chaosForm.chaos_method,
    );

    return activeMethod?.supportedTargets || SERVICE_NAMES;
  }, [chaosCatalog.methods, chaosForm.chaos_method]);

  const selectedTargetServices = useMemo(() => {
    const selected = Array.isArray(chaosForm.target_services) ? chaosForm.target_services : [];
    return selected.filter((service) => availableTargets.includes(service));
  }, [availableTargets, chaosForm.target_services]);

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
    async (options = {}) =>
      runTask(
        "health",
        async () => {
          const payload = await apiFetch("/health/services");
          setServices(
            getList(payload, ["services"]).length
              ? getList(payload, ["services"])
              : SERVICE_NAMES.map((name) => ({ name, status: "UNKNOWN" })),
          );
          setHealthTimestamp(payload.timestamp || new Date().toISOString());
          return payload;
        },
        options,
      ),
    [apiFetch, runTask],
  );

  const refreshTopology = useCallback(async () => {
    const payload = await apiFetch("/topology");
    setTopology(payload);
    return payload;
  }, [apiFetch]);

  const refreshChaosCatalog = useCallback(async () => {
    const payload = await apiFetch("/chaos/methods");
    setChaosCatalog(payload);
    setChaosForm((current) => ({
      ...current,
      ...payload.defaultConfig,
      target_services:
        current.target_services && current.target_services.length
          ? current.target_services
          : payload.methods?.[0]?.supportedTargets?.slice(0, 1) || ["fraud-check-service"],
    }));
    return payload;
  }, [apiFetch]);

  const refreshExperiments = useCallback(async () => {
    return runTask("health", async () => {
      const payload = await apiFetch("/experiments");
      setExperiments(getList(payload, ["experiments", "items", "data"]));
      setLatestExperimentOverride(null);
      return payload;
    });
  }, [apiFetch, runTask]);

  const refreshGoldenTraces = useCallback(async () => {
    return runTask("health", async () => {
      const payload = await apiFetch("/golden-traces");
      setGoldenTraces(getList(payload, ["golden_traces", "traces", "items", "data"]));
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
          const detail = await apiFetch(`/experiments/${encodeURIComponent(experimentId)}`);
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
    refreshTopology();
    refreshChaosCatalog();
  }, [
    refreshChaosCatalog,
    refreshExperiments,
    refreshGoldenTraces,
    refreshHealth,
    refreshTopology,
  ]);

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

  useEffect(() => {
    if (!availableTargets.length) {
      return;
    }

    if (!selectedTargetServices.length) {
      setChaosForm((current) => ({
        ...current,
        target_services: [availableTargets[0]],
      }));
    }
  }, [availableTargets, selectedTargetServices.length]);

  const runDemoTransaction = async () => {
    const payload = await runTask("transaction", async () =>
      apiFetch("/banking/demo-transaction", {
        method: "POST",
        body: JSON.stringify({
          count: Number(transactionForm.count),
          concurrency: Number(transactionForm.concurrency),
        }),
      }),
    );

    if (payload) {
      setTransactionResult(payload);
      refreshHealth({ keepError: true });
    }
  };

  const runChaosScenario = async () => {
    const payload = await runTask("runChaos", async () =>
      apiFetch("/experiments/run", {
        method: "POST",
        body: JSON.stringify({
          target_service: selectedTargetServices[0],
          target_services: selectedTargetServices,
          chaos_method: chaosForm.chaos_method,
          config: {
            latencyMs: Number(chaosForm.latencyMs),
            packetLossRate: Number(chaosForm.packetLossRate),
            cpuStressMs: Number(chaosForm.cpuStressMs),
            memoryStressMb: Number(chaosForm.memoryStressMb),
            partialFailureRate: Number(chaosForm.partialFailureRate),
            requestCount: Number(chaosForm.requestCount),
            concurrency: Number(chaosForm.concurrency),
          },
        }),
      }),
    );

    if (payload) {
      setLatestExperimentOverride(payload);
      await refreshHealth({ keepError: true });
      await refreshExperiments();
    }
  };

  const recoverScenario = async () => {
    const payload = await runTask("recover", async () =>
      apiFetch("/experiments/recover", {
        method: "POST",
        body: JSON.stringify({
          experimentId: latestExperiment?.id,
        }),
      }),
    );

    if (payload) {
      setLatestExperimentOverride(payload);
      await refreshHealth({ keepError: true });
      await refreshExperiments();
    }
  };

  const analyzeLastExperiment = async () => {
    const experimentId = getExperimentId(latestExperiment);

    if (!experimentId) {
      setErrorMessage("Analiz edilecek bir deney bulunamadı.");
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
    [
      "target_services",
      latestExperiment?.target_services?.length
        ? latestExperiment?.target_services
        : latestExperiment?.target_service,
    ],
    ["fault_type", latestExperiment?.fault_type],
    ["chaos_method_category", latestExperiment?.chaos_method_category],
    ["status", latestExperiment?.status],
    ["affected_services", latestExperiment?.affected_services],
    ["risk_score", latestExperiment?.risk_score],
    ["risk_level", latestExperiment?.risk_level],
    ["started_at", latestExperiment?.started_at, true],
    ["ended_at", latestExperiment?.ended_at, true],
  ];

  const metricSummary = latestExperiment?.metric_summary || {};
  const metricEntries = [
    ["request_count", metricSummary.requestCount],
    ["successful_requests", metricSummary.successfulRequests],
    ["failed_requests", metricSummary.failedRequests],
    ["degraded_requests", metricSummary.degradedRequests],
    ["avg_latency_ms", metricSummary.averageLatencyMs],
    ["p95_latency_ms", metricSummary.p95LatencyMs],
    ["peak_latency_ms", metricSummary.peakLatencyMs],
  ].filter(([, value]) => value !== undefined && value !== null);

  const recommendations = Array.isArray(visibleTrace.developer_recommendations)
    ? visibleTrace.developer_recommendations
    : [];

  const showLatencyFields = ["network_delay"].includes(chaosForm.chaos_method);
  const showPacketLossField = chaosForm.chaos_method === "packet_loss";
  const showCpuField = chaosForm.chaos_method === "cpu_stress";
  const showMemoryField = chaosForm.chaos_method === "memory_stress";
  const showPartialFailureField = chaosForm.chaos_method === "partial_failure";
  const showLoadFields = chaosForm.chaos_method === "traffic_surge";

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
          <p className="subtitle">Genişletilmiş servis zincirleri ve çoklu chaos metodları.</p>
          <p className="slogan">Break safely. Learn visibly. Repair stronger.</p>
          <p className="hero-description">
            Transaction → Limit → Account ve Transaction → Fraud → Risk Profile zincirleri
            üzerinde gecikme, kısmi arıza, yük ve bağımlılık kopması gibi senaryoları test edin.
          </p>
        </div>

        <div className="hero-status" aria-label="Resilience Memory status">
          <div className="hero-orbit">
            <Banknote size={34} />
            <span />
            <span />
          </div>
          <div>
            <span>Risk Score</span>
            <strong>{Math.round(riskScore)}</strong>
            <small>{formatValue(visibleTrace.risk_level || latestExperiment?.risk_level)}</small>
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
            eyebrow="Bağımlılık Topolojisi"
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
                  {service.details?.chaosMode && service.details.chaosMode !== "none" ? (
                    <span className="fallback-badge">{service.details.chaosMode}</span>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="chain-list">
              {topology.dependencies.map((edge) => {
                const fromStatus = getServiceStatus(services, edge.from);
                const toStatus = getServiceStatus(services, edge.to);
                const isImpacted =
                  String(fromStatus).toUpperCase() !== "UP" ||
                  String(toStatus).toUpperCase() !== "UP";

                return (
                  <div
                    className={`dependency-line ${isImpacted ? "is-cracked" : ""}`}
                    key={`${edge.from}-${edge.to}-${edge.label}`}
                  >
                    <span>{edge.from}</span>
                    <div className="line-track">
                      {isImpacted ? <i className="gold-crack" /> : null}
                    </div>
                    <span>{edge.to}</span>
                    <small>{edge.label}</small>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel">
          <SectionTitle
            icon={Banknote}
            eyebrow="Demo Banking Flow"
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

          <div className="control-grid form-grid">
            <label className="field">
              <span>Transaction Count</span>
              <input
                type="number"
                min="1"
                max="50"
                value={transactionForm.count}
                onChange={(event) =>
                  setTransactionForm((current) => ({
                    ...current,
                    count: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Concurrency</span>
              <input
                type="number"
                min="1"
                max={transactionForm.count}
                value={transactionForm.concurrency}
                onChange={(event) =>
                  setTransactionForm((current) => ({
                    ...current,
                    concurrency: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="transaction-result">
            <DetailRow label="transactionId" value={transactionResult?.transactionId} />
            <DetailRow label="status" value={transactionResult?.status} />
            <DetailRow label="message" value={transactionResult?.message} />
            <DetailRow label="fraudCheckStatus" value={transactionResult?.fraudCheckStatus} />
            <DetailRow label="limitCheckStatus" value={transactionResult?.limitCheckStatus} />
            <DetailRow
              label="requestCount"
              value={transactionResult?.metric_summary?.requestCount || transactionResult?.requestCount}
            />
            <DetailRow
              label="failedRequests"
              value={transactionResult?.metric_summary?.failedRequests}
            />
            <DetailRow
              label="degradedRequests"
              value={transactionResult?.metric_summary?.degradedRequests}
            />
          </div>

          {String(transactionResult?.status || "").startsWith("pending_") ? (
            <div className="safe-degradation-callout">
              <ShieldCheck size={18} />
              Safe Degradation Activated
            </div>
          ) : null}
        </section>

        <section className="panel">
          <SectionTitle icon={FlaskConical} eyebrow="Chaos Engine" title="Experiment Controls" />

          <div className="control-grid form-grid">
            <label className="field">
              <span>Chaos Method</span>
              <select
                value={chaosForm.chaos_method}
                onChange={(event) =>
                  setChaosForm((current) => ({
                    ...current,
                    chaos_method: event.target.value,
                  }))
                }
              >
                {chaosCatalog.methods.map((method) => (
                  <option key={method.code} value={method.code}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="field">
              <span>Target Services</span>
              <div className="target-service-grid">
                {availableTargets.map((target) => {
                  const checked = selectedTargetServices.includes(target);
                  return (
                    <label className="target-service-option" key={target}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setChaosForm((current) => {
                            const currentTargets = Array.isArray(current.target_services)
                              ? current.target_services
                              : [];

                            if (event.target.checked) {
                              if (current.chaos_method === "traffic_surge") {
                                return {
                                  ...current,
                                  target_services: [target],
                                };
                              }

                              return {
                                ...current,
                                target_services: [...new Set([...currentTargets, target])],
                              };
                            }

                            const nextTargets = currentTargets.filter((item) => item !== target);
                            return {
                              ...current,
                              target_services: nextTargets.length ? nextTargets : [availableTargets[0]],
                            };
                          })
                        }
                      />
                      <span>{target}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {showLatencyFields ? (
              <label className="field">
                <span>Latency (ms)</span>
                <input
                  type="number"
                  value={chaosForm.latencyMs}
                  onChange={(event) =>
                    setChaosForm((current) => ({
                      ...current,
                      latencyMs: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            {showPacketLossField ? (
              <label className="field">
                <span>Packet Loss Rate</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={chaosForm.packetLossRate}
                  onChange={(event) =>
                    setChaosForm((current) => ({
                      ...current,
                      packetLossRate: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            {showCpuField ? (
              <label className="field">
                <span>CPU Burn (ms)</span>
                <input
                  type="number"
                  value={chaosForm.cpuStressMs}
                  onChange={(event) =>
                    setChaosForm((current) => ({
                      ...current,
                      cpuStressMs: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            {showMemoryField ? (
              <label className="field">
                <span>Memory (MB)</span>
                <input
                  type="number"
                  value={chaosForm.memoryStressMb}
                  onChange={(event) =>
                    setChaosForm((current) => ({
                      ...current,
                      memoryStressMb: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            {showPartialFailureField ? (
              <label className="field">
                <span>Partial Failure Rate</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={chaosForm.partialFailureRate}
                  onChange={(event) =>
                    setChaosForm((current) => ({
                      ...current,
                      partialFailureRate: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            {showLoadFields ? (
              <>
                <label className="field">
                  <span>Request Count</span>
                  <input
                    type="number"
                    value={chaosForm.requestCount}
                    onChange={(event) =>
                      setChaosForm((current) => ({
                        ...current,
                        requestCount: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Concurrency</span>
                  <input
                    type="number"
                    value={chaosForm.concurrency}
                    onChange={(event) =>
                      setChaosForm((current) => ({
                        ...current,
                        concurrency: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            ) : null}
          </div>

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
              onClick={runChaosScenario}
              disabled={loading.runChaos}
            >
              <AlertTriangle size={17} />
              {loading.runChaos ? "Injecting..." : "Run Chaos"}
            </button>
            <button
              className="control-button success"
              type="button"
              onClick={recoverScenario}
              disabled={loading.recover || !latestExperiment || latestExperiment.status === "completed"}
            >
              <HeartPulse size={17} />
              Recover Experiment
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
          <SectionTitle icon={History} eyebrow="Latest Experiment" title="Latest Fault" />

          <div className="details-stack">
            {experimentFields.map(([label, value, date]) => (
              <DetailRow key={label} label={label} value={value} date={date} />
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionTitle icon={Gauge} eyebrow="Metrics / Impact" title="Blast Signals" />

          <div className="metrics-grid">
            {metricEntries.length ? (
              metricEntries.map(([label, value]) => (
                <DataChip key={label} label={label} value={value} />
              ))
            ) : (
              <div className="empty-state">No metrics returned yet.</div>
            )}
          </div>
        </section>

        <section className="panel wide-panel">
          <SectionTitle icon={Gauge} eyebrow="Quantified Risk" title="Risk Model" />

          <div className="risk-score-summary">
            <div>
              <span>Final Score</span>
              <strong>{Math.round(riskScore)}</strong>
            </div>
            <StatusPill value={visibleTrace.risk_level || latestExperiment?.risk_level} />
          </div>

          <div className="risk-bars">
            {riskMetrics.length ? (
              riskMetrics.map((metric) => (
                <div className="risk-bar-row" key={metric.name}>
                  <div className="risk-bar-meta">
                    <span>{metric.label}</span>
                    <small>{formatValue(metric.rawValue)}</small>
                  </div>
                  <div className="risk-bar-track">
                    <div
                      className="risk-bar-fill"
                      style={{ width: `${Number(metric.normalizedValue || 0)}%` }}
                    />
                  </div>
                  <strong>{Math.round(Number(metric.normalizedValue || 0))}</strong>
                </div>
              ))
            ) : (
              <div className="empty-state">Risk breakdown will appear after an experiment.</div>
            )}
          </div>
        </section>

        <section className="panel trace-panel wide-panel">
          <SectionTitle icon={BrainCircuit} eyebrow="Golden Trace" title="Gemini Analysis">
            <StatusPill value={visibleTrace.risk_level} />
          </SectionTitle>

          <div className="trace-grid">
            <article className="trace-block">
              <span>Chaos Method Classification</span>
              <p>{formatValue(visibleTrace.chaos_method_classification)}</p>
            </article>
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
              <span>Risk Reasoning</span>
              <p>{formatValue(visibleTrace.risk_level_reasoning)}</p>
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
          </div>
        </section>

        <section className="panel history-panel">
          <SectionTitle icon={History} eyebrow="Experiment History" title="Fracture Memory" />

          <div className="history-list">
            {experiments.length ? (
              experiments.map((experiment, index) => (
                <article className="history-item" key={experiment.id || index}>
                  <div>
                    <strong>{formatValue(experiment.id)}</strong>
                    <span>
                      {formatValue(
                        experiment.target_services?.length
                          ? experiment.target_services
                          : experiment.target_service,
                      )}{" "}
                      · {formatValue(experiment.fault_type)}
                    </span>
                  </div>
                  <div className="history-status-stack">
                    <StatusPill value={experiment.status} />
                    <small>Risk {Math.round(Number(experiment.risk_score || 0))}</small>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">No experiments recorded yet.</div>
            )}
          </div>
        </section>

        <section className="panel history-panel">
          <SectionTitle icon={Gem} eyebrow="Golden Trace History" title="Resilience Memory" />

          <div className="history-list">
            {goldenTraces.length ? (
              goldenTraces.map((trace, index) => (
                <article className="history-item trace-history-item" key={trace.id || index}>
                  <div>
                    <strong>{formatValue(trace.id)}</strong>
                    <span>{formatValue(trace.chaos_method_classification || trace.summary)}</span>
                  </div>
                  <div className="history-status-stack">
                    <StatusPill value={trace.risk_level} />
                    <small>Score {Math.round(Number(trace.risk_score || 0))}</small>
                  </div>
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
