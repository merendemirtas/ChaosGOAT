const express = require("express");
const cors = require("cors");
const { promisify } = require("util");
const { execFile } = require("child_process");
const {
  addGoldenTrace,
  addIncidentLog,
  addServiceMetric,
  createExperiment,
  getExperimentById,
  getExperimentDetail,
  getGoldenTraceById,
  getLatestRunningExperiment,
  initDb,
  listExperiments,
  listGoldenTraces,
  updateExperiment,
  upsertServiceStatus
} = require("./db");
const { analyzeWithGemini, buildFallbackAnalysis } = require("./geminiAnalyzer");
const { computeRiskProfile, summarizeRequestMetrics } = require("./riskModel");
const {
  CHAOS_DEFAULT_CONFIG,
  CHAOS_METHODS,
  SAFE_DEGRADATION_MESSAGE,
  SERVICE_DEPENDENCIES,
  SERVICE_REGISTRY
} = require("./constants");

const PORT = Number(process.env.PORT || 4000);
const TRANSACTION_SERVICE_URL =
  process.env.TRANSACTION_SERVICE_URL || "http://transaction-service:4002";

const execFileAsync = promisify(execFile);

const app = express();
app.use(cors());
app.use(express.json());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildExperimentId() {
  return `exp_${Date.now()}`;
}

function buildGoldenTraceId() {
  return `gt_${Date.now()}`;
}

function getServiceConfig(name) {
  return SERVICE_REGISTRY.find((service) => service.name === name);
}

function getChaosMethodConfig(code) {
  return CHAOS_METHODS.find((item) => item.code === code);
}

function normalizeTargetServices(targetServices, targetService) {
  const list = Array.isArray(targetServices) && targetServices.length
    ? targetServices
    : [targetService];

  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeChaosConfig(method, config = {}) {
  return {
    mode: method,
    latencyMs: Number(config.latencyMs ?? CHAOS_DEFAULT_CONFIG.latencyMs),
    packetLossRate: Number(config.packetLossRate ?? CHAOS_DEFAULT_CONFIG.packetLossRate),
    cpuStressMs: Number(config.cpuStressMs ?? CHAOS_DEFAULT_CONFIG.cpuStressMs),
    memoryStressMb: Number(config.memoryStressMb ?? CHAOS_DEFAULT_CONFIG.memoryStressMb),
    partialFailureRate: Number(
      config.partialFailureRate ?? CHAOS_DEFAULT_CONFIG.partialFailureRate
    ),
    partialFailurePattern:
      config.partialFailurePattern || CHAOS_DEFAULT_CONFIG.partialFailurePattern,
    requestCount: Number(config.requestCount ?? CHAOS_DEFAULT_CONFIG.requestCount),
    concurrency: Number(config.concurrency ?? CHAOS_DEFAULT_CONFIG.concurrency)
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 2500);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const error = new Error(
        typeof payload === "object" && payload?.message
          ? payload.message
          : `Request failed with status ${response.status}`
      );
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function runDockerCommand(action, containerName) {
  const { stdout, stderr } = await execFileAsync("docker", [action, containerName]);
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function checkServiceHealth(service) {
  const startedAt = Date.now();

  try {
    const body = await fetchJson(`${service.url}${service.healthPath}`, { timeoutMs: 2000 });
    const status = body.status || "UP";
    await upsertServiceStatus(service.name, status, service.criticality);

    return {
      name: service.name,
      status,
      latencyMs: Date.now() - startedAt,
      body
    };
  } catch (error) {
    await upsertServiceStatus(service.name, "DOWN", service.criticality);
    return {
      name: service.name,
      status: "DOWN",
      latencyMs: Date.now() - startedAt,
      error: error.message
    };
  }
}

async function snapshotAllServices() {
  const snapshots = [];
  for (const service of SERVICE_REGISTRY) {
    snapshots.push(await checkServiceHealth(service));
  }
  return snapshots;
}

async function waitForServicesToBeUp({ maxAttempts = 20, delayMs = 1000 } = {}) {
  let lastSnapshot = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastSnapshot = await snapshotAllServices();

    if (lastSnapshot.every((service) => service.status === "UP")) {
      return lastSnapshot;
    }

    await sleep(delayMs);
  }

  return lastSnapshot;
}

async function configureServiceChaos(targetService, chaosConfig) {
  const service = getServiceConfig(targetService);

  if (!service || !service.controlPath) {
    throw new Error(`Service ${targetService} does not support chaos configuration.`);
  }

  return fetchJson(`${service.url}${service.controlPath}/configure`, {
    method: "POST",
    body: JSON.stringify(chaosConfig),
    timeoutMs: 3000
  });
}

async function resetServiceChaos(targetService) {
  const service = getServiceConfig(targetService);

  if (!service || !service.controlPath) {
    return null;
  }

  return fetchJson(`${service.url}${service.controlPath}/reset`, {
    method: "POST",
    body: JSON.stringify({}),
    timeoutMs: 3000
  });
}

async function invokeDemoTransaction() {
  const startedAt = Date.now();

  try {
    const result = await fetchJson(`${TRANSACTION_SERVICE_URL}/transactions/demo`, {
      method: "POST",
      body: JSON.stringify({}),
      timeoutMs: 5000
    });

    return {
      ...result,
      latencyMs: Date.now() - startedAt,
      outcome: "success",
      degraded: Boolean(result.degraded || result.status === "pending_manual_review")
    };
  } catch (error) {
    return {
      status: "failed",
      degraded: false,
      outcome: "failed",
      latencyMs: Date.now() - startedAt,
      error: error.message
    };
  }
}

async function runBatchedRequests(requestCount, concurrency) {
  const results = [];

  for (let index = 0; index < requestCount; index += concurrency) {
    const batch = [];
    for (let offset = 0; offset < concurrency && index + offset < requestCount; offset += 1) {
      batch.push(invokeDemoTransaction());
    }
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  return results;
}

function affectedServicesFromSnapshot(snapshot) {
  return snapshot
    .filter((item) => item.status !== "UP")
    .map((item) => item.name);
}

function buildImpactChain(affectedServices) {
  return SERVICE_DEPENDENCIES.filter(
    (edge) =>
      affectedServices.includes(edge.from) ||
      affectedServices.includes(edge.to)
  );
}

async function persistServiceSnapshot(experimentId, snapshot, requestSummary) {
  for (const serviceState of snapshot) {
    await addServiceMetric({
      experiment_id: experimentId,
      service_name: serviceState.name,
      status: serviceState.status,
      latency_ms: serviceState.latencyMs,
      error_count: serviceState.status === "DOWN" ? 1 : 0,
      degraded_count: serviceState.status === "DEGRADED" ? 1 : 0,
      failed_requests: requestSummary.failedRequests,
      fallback_used: requestSummary.fallbackUsed,
      success_count: requestSummary.successfulRequests,
      packet_loss_count: 0,
      timeout_count: 0,
      notes: serviceState.body || { error: serviceState.error || null },
      timestamp: new Date().toISOString()
    });
  }
}

function buildExperimentResponse(experiment, message) {
  return {
    id: experiment.id,
    target_service: experiment.target_service,
    target_services: experiment.target_services || [experiment.target_service].filter(Boolean),
    affected_service: experiment.affected_service,
    fault_type: experiment.fault_type,
    chaos_method_category: experiment.chaos_method_category,
    status: experiment.status,
    message,
    risk_score: experiment.risk_score,
    risk_level: experiment.risk_level
  };
}

async function runChaosExperiment({ targetService, targetServices, chaosMethod, config = {} }) {
  const existing = await getLatestRunningExperiment();
  if (existing) {
    const error = new Error("A chaos experiment is already running.");
    error.statusCode = 409;
    throw error;
  }

  const normalizedTargets = normalizeTargetServices(targetServices, targetService);
  const chaosMethodConfig = getChaosMethodConfig(chaosMethod);

  if (!normalizedTargets.length) {
    const error = new Error("At least one target service is required.");
    error.statusCode = 400;
    throw error;
  }

  const targets = normalizedTargets.map((serviceName) => {
    const service = getServiceConfig(serviceName);

    if (!service) {
      const error = new Error(`Unknown target service: ${serviceName}`);
      error.statusCode = 400;
      throw error;
    }

    if (!chaosMethodConfig || !chaosMethodConfig.supportedTargets.includes(serviceName)) {
      const error = new Error(`Chaos method ${chaosMethod} is not supported for ${serviceName}`);
      error.statusCode = 400;
      throw error;
    }

    return service;
  });

  const startedAt = new Date().toISOString();
  const normalizedConfig = normalizeChaosConfig(chaosMethod, config);
  const experiment = {
    id: buildExperimentId(),
    domain: "banking",
    target_service: normalizedTargets.join(", "),
    target_services: normalizedTargets,
    affected_service: "transaction-service",
    fault_type: chaosMethod,
    chaos_method_category: chaosMethodConfig.category,
    status: chaosMethod === "traffic_surge" ? "completed" : "running",
    started_at: startedAt,
    ended_at: chaosMethod === "traffic_surge" ? startedAt : null,
    recovery_time_ms: chaosMethod === "traffic_surge" ? 0 : null,
    safe_degradation: SAFE_DEGRADATION_MESSAGE,
    chaos_config: normalizedConfig,
    created_at: startedAt
  };

  await createExperiment(experiment);
  await addIncidentLog({
    experiment_id: experiment.id,
    level: "INFO",
    message: `Chaos experiment started with method ${chaosMethod} on ${normalizedTargets.join(", ")}.`,
    metadata_json: {
      targetServices: normalizedTargets,
      chaosMethod,
      config: normalizedConfig
    },
    created_at: startedAt
  });

  if (chaosMethod === "service_kill") {
    for (const target of targets) {
      await runDockerCommand("stop", target.containerName);
    }
    await sleep(800);
  } else if (chaosMethod !== "traffic_surge") {
    for (const target of targets) {
      await configureServiceChaos(target.name, normalizedConfig);
    }
  }

  const responses =
    chaosMethod === "traffic_surge"
      ? await runBatchedRequests(normalizedConfig.requestCount, normalizedConfig.concurrency)
      : await runBatchedRequests(normalizedConfig.requestCount, 1);

  const serviceSnapshot = await snapshotAllServices();
  const affectedServices = [
    ...new Set([
      ...normalizedTargets,
      ...affectedServicesFromSnapshot(serviceSnapshot),
      ...responses.filter((item) => item.degraded).map(() => "transaction-service")
    ])
  ];
  const metricSummary = summarizeRequestMetrics(responses);
  const impactChain = buildImpactChain(affectedServices);

  await persistServiceSnapshot(experiment.id, serviceSnapshot, metricSummary);

  for (const result of responses) {
    await addIncidentLog({
      experiment_id: experiment.id,
      level: result.outcome === "failed" ? "ERROR" : result.degraded ? "WARN" : "INFO",
      message:
        result.outcome === "failed"
          ? "Transaction request failed during chaos experiment."
          : result.degraded
            ? "Transaction request entered safe degradation during chaos experiment."
            : "Transaction request completed successfully during chaos experiment.",
      metadata_json: result,
      created_at: new Date().toISOString()
    });
  }

  const riskProfile = computeRiskProfile(
    {
      ...experiment,
      target_services: normalizedTargets,
      affected_services: affectedServices,
      request_count: metricSummary.requestCount,
      success_count: metricSummary.successfulRequests,
      failed_count: metricSummary.failedRequests,
      degraded_count: metricSummary.degradedRequests,
      average_latency_ms: metricSummary.averageLatencyMs,
      p95_latency_ms: metricSummary.p95LatencyMs,
      peak_latency_ms: metricSummary.peakLatencyMs,
      impact_chain: impactChain
    },
    {
      affected_services: affectedServices,
      metric_summary: metricSummary
    }
  );

  const updatedExperiment = await updateExperiment(experiment.id, {
    affected_services: affectedServices,
    request_count: metricSummary.requestCount,
    success_count: metricSummary.successfulRequests,
    failed_count: metricSummary.failedRequests,
    degraded_count: metricSummary.degradedRequests,
    average_latency_ms: Number(metricSummary.averageLatencyMs.toFixed(2)),
    p95_latency_ms: Number(metricSummary.p95LatencyMs.toFixed(2)),
    peak_latency_ms: Number(metricSummary.peakLatencyMs.toFixed(2)),
    risk_score: riskProfile.score,
    risk_level: riskProfile.level,
    risk_metrics: riskProfile.metrics,
    impact_chain: impactChain,
    status: experiment.status,
    ended_at: experiment.ended_at,
    recovery_time_ms: experiment.recovery_time_ms
  });

  return buildExperimentResponse(
    updatedExperiment,
    chaosMethod === "traffic_surge"
      ? `${normalizedTargets.join(", ")} traffic surge executed`
      : `${normalizedTargets.join(", ")} chaos injection active`
  );
}

async function recoverChaosExperiment(experimentId) {
  const experiment = experimentId
    ? await getExperimentById(experimentId)
    : await getLatestRunningExperiment();

  if (!experiment) {
    const error = new Error("No running experiment found.");
    error.statusCode = 404;
    throw error;
  }

  const targetServices = normalizeTargetServices(
    experiment.target_services,
    experiment.target_service
  );
  const targets = targetServices.map((serviceName) => getServiceConfig(serviceName)).filter(Boolean);

  if (experiment.fault_type === "service_kill") {
    for (const target of targets) {
      await runDockerCommand("start", target.containerName);
    }
    await sleep(1500);
  } else if (experiment.fault_type !== "traffic_surge") {
    for (const serviceName of targetServices) {
      await resetServiceChaos(serviceName);
    }
  }

  const endedAt = new Date().toISOString();
  const recoveryTimeMs = new Date(endedAt).getTime() - new Date(experiment.started_at).getTime();
  const postRecoverySnapshot =
    experiment.fault_type === "traffic_surge"
      ? await snapshotAllServices()
      : await waitForServicesToBeUp();

  await addIncidentLog({
    experiment_id: experiment.id,
    level: "INFO",
    message: `Recovery executed for ${targetServices.join(", ")}.`,
    metadata_json: {
      faultType: experiment.fault_type
    },
    created_at: endedAt
  });

  for (const serviceState of postRecoverySnapshot) {
    await addServiceMetric({
      experiment_id: experiment.id,
      service_name: serviceState.name,
      status: serviceState.status,
      latency_ms: serviceState.latencyMs,
      error_count: serviceState.status === "DOWN" ? 1 : 0,
      degraded_count: serviceState.status === "DEGRADED" ? 1 : 0,
      failed_requests: 0,
      fallback_used: false,
      success_count: 0,
      packet_loss_count: 0,
      timeout_count: 0,
      notes: serviceState.body || { error: serviceState.error || null },
      timestamp: endedAt
    });
  }

  const unresolvedServices = postRecoverySnapshot
    .filter((serviceState) => serviceState.status !== "UP")
    .map((serviceState) => ({
      name: serviceState.name,
      status: serviceState.status
    }));

  if (unresolvedServices.length) {
    await addIncidentLog({
      experiment_id: experiment.id,
      level: "WARN",
      message: "Recovery completed but some services are still not UP.",
      metadata_json: {
        unresolvedServices
      },
      created_at: new Date().toISOString()
    });
  }

  const recoveredExperiment = await updateExperiment(experiment.id, {
    status: "completed",
    ended_at: endedAt,
    recovery_time_ms: recoveryTimeMs
  });

  const riskProfile = computeRiskProfile(recoveredExperiment, recoveredExperiment);

  return updateExperiment(experiment.id, {
    risk_score: riskProfile.score,
    risk_level: riskProfile.level,
    risk_metrics: riskProfile.metrics
  });
}

app.get("/health/services", async (_req, res, next) => {
  try {
    const checks = await snapshotAllServices();

    res.json({
      services: checks.map((item) => ({
        name: item.name,
        status: item.status,
        latencyMs: item.latencyMs,
        details: item.body || null
      })),
      dependencyChains: SERVICE_DEPENDENCIES,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/topology", (_req, res) => {
  res.json({
    services: SERVICE_REGISTRY.map((service) => ({
      name: service.name,
      criticality: service.criticality
    })),
    dependencies: SERVICE_DEPENDENCIES
  });
});

app.get("/chaos/methods", (_req, res) => {
  res.json({
    methods: CHAOS_METHODS,
    defaultConfig: CHAOS_DEFAULT_CONFIG
  });
});

app.post("/banking/demo-transaction", async (req, res, next) => {
  try {
    const count = Math.max(1, Math.min(50, Number(req.body?.count || 1)));
    const concurrency = Math.max(1, Math.min(count, Number(req.body?.concurrency || 1)));

    if (count === 1) {
      const result = await fetchJson(`${TRANSACTION_SERVICE_URL}/transactions/demo`, {
        method: "POST",
        body: JSON.stringify({})
      });

      console.log(`[kintsugi-monkey-api] demo transaction result: ${JSON.stringify(result)}`);
      return res.json(result);
    }

    const results = await runBatchedRequests(count, concurrency);
    const metricSummary = summarizeRequestMetrics(results);

    return res.json({
      status:
        metricSummary.failedRequests > 0
          ? "failed"
          : metricSummary.degradedRequests > 0
            ? "pending_manual_review"
            : "approved",
      requestCount: count,
      concurrency,
      metric_summary: metricSummary,
      results
    });
  } catch (error) {
    next(error);
  }
});

app.post("/experiments/run", async (req, res, next) => {
  try {
    const { target_service, target_services, chaos_method, config } = req.body || {};
    const result = await runChaosExperiment({
      targetService: target_service,
      targetServices: target_services,
      chaosMethod: chaos_method,
      config
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/experiments/recover", async (req, res, next) => {
  try {
    const result = await recoverChaosExperiment(req.body?.experimentId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/experiments/kill-fraud-check", async (_req, res, next) => {
  try {
    const result = await runChaosExperiment({
      targetService: "fraud-check-service",
      chaosMethod: "service_kill",
      config: {}
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/experiments/recover-fraud-check", async (_req, res, next) => {
  try {
    const result = await recoverChaosExperiment();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/experiments/:id/analyze", async (req, res, next) => {
  try {
    const detail = await getExperimentDetail(req.params.id);

    if (!detail) {
      return res.status(404).json({
        message: "Experiment not found."
      });
    }

    const riskProfile = computeRiskProfile(detail, detail);
    const normalizedPayload = {
      experiment: {
        id: detail.id,
        domain: detail.domain,
        target_service: detail.target_service,
        target_services: detail.target_services,
        affected_service: detail.affected_service,
        affected_services: detail.affected_services,
        fault_type: detail.fault_type,
        chaos_method_category: detail.chaos_method_category,
        status: detail.status,
        started_at: detail.started_at,
        ended_at: detail.ended_at,
        recovery_time_ms: detail.recovery_time_ms,
        safe_degradation: detail.safe_degradation
      },
      topology: {
        services: SERVICE_REGISTRY.map((service) => ({
          name: service.name,
          criticality: service.criticality
        })),
        dependencies: SERVICE_DEPENDENCIES
      },
      service_metrics: detail.metrics,
      incident_logs: detail.logs,
      risk_profile: riskProfile
    };

    let analysis;
    let analyzer = "gemini";

    try {
      analysis = await analyzeWithGemini(normalizedPayload);
    } catch (error) {
      analyzer = "fallback";
      console.warn(`[kintsugi-monkey-api] Gemini unavailable, using fallback analyzer: ${error.message}`);
      analysis = buildFallbackAnalysis(normalizedPayload);
    }

    const trace = {
      id: buildGoldenTraceId(),
      experiment_id: detail.id,
      chaos_method_classification: analysis.chaos_method_classification,
      summary: analysis.summary,
      suspected_weak_point: analysis.suspected_weak_point,
      blast_radius: analysis.blast_radius,
      risk_level: riskProfile.level,
      risk_score: riskProfile.score,
      risk_level_reasoning: analysis.risk_level_reasoning,
      safe_degradation_review: analysis.safe_degradation_review,
      developer_recommendations: analysis.developer_recommendations,
      next_experiments: [],
      risk_metrics: riskProfile.metrics,
      kintsugi_lesson: "",
      translated_to: "en",
      raw_ai_response: JSON.stringify({
        analyzer,
        response: analysis.raw_ai_response || null
      }),
      created_at: new Date().toISOString()
    };

    await addGoldenTrace(trace);

    const {
      next_experiments: _nextExperiments,
      kintsugi_lesson: _kintsugiLesson,
      ...clientTrace
    } = trace;

    res.json({
      ...clientTrace,
      analyzer
    });
  } catch (error) {
    next(error);
  }
});

app.get("/experiments", async (_req, res, next) => {
  try {
    const experiments = await listExperiments();
    res.json(experiments);
  } catch (error) {
    next(error);
  }
});

app.get("/experiments/:id", async (req, res, next) => {
  try {
    const experiment = await getExperimentDetail(req.params.id);

    if (!experiment) {
      return res.status(404).json({
        message: "Experiment not found."
      });
    }

    res.json(experiment);
  } catch (error) {
    next(error);
  }
});

app.get("/golden-traces", async (_req, res, next) => {
  try {
    const traces = await listGoldenTraces();
    res.json(traces);
  } catch (error) {
    next(error);
  }
});

app.get("/golden-traces/:id", async (req, res, next) => {
  try {
    const trace = await getGoldenTraceById(req.params.id);

    if (!trace) {
      return res.status(404).json({
        message: "Golden Trace not found."
      });
    }

    res.json(trace);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(`[kintsugi-monkey-api] ${error.stack || error.message}`);

  res.status(error.statusCode || 500).json({
    error: "Internal Server Error",
    message: error.message
  });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[kintsugi-monkey-api] listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`[kintsugi-monkey-api] failed to initialize: ${error.stack || error.message}`);
    process.exit(1);
  });
