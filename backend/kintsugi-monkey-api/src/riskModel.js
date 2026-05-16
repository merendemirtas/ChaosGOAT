const { CHAOS_METHODS, CRITICALITY_WEIGHTS, SERVICE_DEPENDENCIES, SERVICE_REGISTRY } = require("./constants");

const METHOD_SEVERITY = {
  service_kill: 1,
  db_disconnect: 0.98,
  packet_loss: 0.9,
  network_delay: 0.82,
  cpu_stress: 0.8,
  memory_stress: 0.82,
  cache_disconnect: 0.66,
  traffic_surge: 0.86,
  partial_failure: 0.84
};

const RISK_THRESHOLDS = {
  LOW: 25,
  MEDIUM: 55
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index];
}

function classifyRiskLevel(score) {
  if (score >= RISK_THRESHOLDS.MEDIUM) {
    return "HIGH";
  }

  if (score >= RISK_THRESHOLDS.LOW) {
    return "MEDIUM";
  }

  return "LOW";
}

function methodCategory(methodCode) {
  return CHAOS_METHODS.find((item) => item.code === methodCode)?.category || "unknown";
}

function impactedChainDepth(targetService, affectedServices) {
  const graph = new Map();
  for (const edge of SERVICE_DEPENDENCIES) {
    const list = graph.get(edge.from) || [];
    list.push(edge.to);
    graph.set(edge.from, list);

    const reverseList = graph.get(edge.to) || [];
    reverseList.push(edge.from);
    graph.set(edge.to, reverseList);
  }

  function walk(node, depth, visited = new Set()) {
    visited.add(node);
    const deps = graph.get(node) || [];
    let maxDepth = depth;

    for (const dep of deps) {
      if (!affectedServices.includes(dep) && !affectedServices.includes(node)) {
        continue;
      }

      if (!visited.has(dep)) {
        maxDepth = Math.max(maxDepth, walk(dep, depth + 1, new Set(visited)));
      }
    }

    return maxDepth;
  }

  return walk(targetService, 1);
}

function buildRiskMetric(name, label, rawValue, normalizedValue, weight, description, active = true) {
  const normalized = clamp(Number(normalizedValue || 0), 0, 100);
  return {
    name,
    label,
    rawValue,
    normalizedValue: normalized,
    weight,
    weightedContribution: active ? Number(((normalized / 100) * weight).toFixed(4)) : 0,
    active,
    description
  };
}

function normalizeRate(rate, amplifier = 1.4) {
  return clamp(Math.pow(clamp(rate, 0, 1), 0.8) * amplifier * 100, 0, 100);
}

function computeRiskProfile(experiment, detail) {
  const targetServices = Array.isArray(experiment.target_services)
    ? experiment.target_services
    : Array.isArray(detail?.target_services)
      ? detail.target_services
      : [experiment.target_service].filter(Boolean);
  const primaryTargetServiceName = targetServices[0] || experiment.target_service;
  const targetService = SERVICE_REGISTRY.find((service) => service.name === primaryTargetServiceName);
  const totalServices = SERVICE_REGISTRY.length || 1;
  const affectedServices = Array.isArray(experiment.affected_services)
    ? experiment.affected_services
    : Array.isArray(detail?.affected_services)
      ? detail.affected_services
      : [];
  const summary = experiment.metric_summary || detail?.metric_summary || {};

  const requestCount = Number(summary.requestCount || experiment.request_count || 0);
  const failedCount = Number(summary.failedRequests || experiment.failed_count || 0);
  const degradedCount = Number(summary.degradedRequests || experiment.degraded_count || 0);
  const averageLatencyMs = Number(summary.averageLatencyMs || experiment.average_latency_ms || 0);
  const p95LatencyMs = Number(summary.p95LatencyMs || experiment.p95_latency_ms || 0);
  const recoveryTimeMs = Number(experiment.recovery_time_ms || 0);
  const safeDegradation = Boolean(summary.fallbackUsed || experiment.safe_degradation);
  const blastRadiusCount = affectedServices.length;
  const impactNodes = [
    ...new Set([...targetServices, experiment.affected_service, ...affectedServices].filter(Boolean))
  ];
  const chainDepth = Math.max(
    ...targetServices.map((serviceName) => impactedChainDepth(serviceName, impactNodes)),
    1
  );
  const criticalityScore = CRITICALITY_WEIGHTS[targetService?.criticality || "MEDIUM"] || 0.65;
  const methodSeverity = METHOD_SEVERITY[experiment.fault_type] || 0.5;

  const metrics = [
    buildRiskMetric(
      "downtime",
      "Downtime / Recovery",
      `${Math.round(recoveryTimeMs / 1000)}s`,
      clamp((recoveryTimeMs / 15000) * 100, 0, 100),
      0.16,
      "Longer recovery windows increase operational and customer impact."
    ),
    buildRiskMetric(
      "criticality",
      "Service Criticality",
      targetService?.criticality || "MEDIUM",
      criticalityScore * 100,
      0.14,
      "Critical services contribute more heavily to final risk."
    ),
    buildRiskMetric(
      "blast_radius",
      "Affected Services",
      blastRadiusCount,
      clamp((blastRadiusCount / Math.max(1, totalServices - 1)) * 120, 0, 100),
      0.18,
      "More impacted services expand the blast radius."
    ),
    buildRiskMetric(
      "failure_rate",
      "Failed Request Rate",
      requestCount ? `${Math.round((failedCount / requestCount) * 100)}%` : "0%",
      requestCount ? normalizeRate(failedCount / requestCount, 1.65) : 0,
      0.22,
      "A higher outright failure rate indicates less graceful degradation.",
      requestCount > 0
    ),
    buildRiskMetric(
      "degradation_rate",
      "Degraded Request Rate",
      requestCount ? `${Math.round((degradedCount / requestCount) * 100)}%` : "0%",
      requestCount ? normalizeRate(degradedCount / requestCount, 1.35) : 0,
      0.14,
      "Shows how often users were pushed into fallback or review flows.",
      requestCount > 0
    ),
    buildRiskMetric(
      "latency_p95",
      "P95 Latency",
      `${Math.round(p95LatencyMs)}ms`,
      clamp((p95LatencyMs / 1800) * 100, 0, 100),
      0.1,
      "High tail latency usually appears before a visible outage.",
      p95LatencyMs > 0 || averageLatencyMs > 0
    ),
    buildRiskMetric(
      "dependency_depth",
      "Dependency Chain Depth",
      chainDepth,
      clamp((chainDepth / 3) * 100, 0, 100),
      0.08,
      "Deeper chains amplify downstream propagation risk."
    ),
    buildRiskMetric(
      "method_severity",
      "Chaos Method Severity",
      experiment.fault_type,
      methodSeverity * 100,
      0.08,
      "Some injected failures are inherently more severe than others."
    ),
    buildRiskMetric(
      "simultaneous_targets",
      "Simultaneous Target Count",
      targetServices.length,
      clamp((targetServices.length / 3) * 100, 0, 100),
      0.1,
      "Breaking several services at once should accelerate the risk score.",
      targetServices.length > 0
    )
  ];

  const safeDegradationMetric = buildRiskMetric(
    "safe_degradation_relief",
    "Safe Degradation Relief",
    safeDegradation ? "active" : "inactive",
    safeDegradation ? 40 : 0,
    -0.03,
    "Effective fallback reduces final risk because the system stayed safe.",
    safeDegradation
  );

  metrics.push(safeDegradationMetric);

  const activeMetrics = metrics.filter((metric) => metric.active && metric.weight !== 0);
  const numerator = activeMetrics.reduce(
    (sum, metric) => sum + (metric.normalizedValue / 100) * metric.weight,
    0
  );
  const denominator = activeMetrics.reduce((sum, metric) => sum + Math.abs(metric.weight), 0) || 1;
  const score = clamp((numerator / denominator) * 100, 0, 100);

  return {
    score: Number(score.toFixed(2)),
    level: classifyRiskLevel(score),
    category: methodCategory(experiment.fault_type),
    metrics,
    report: {
      requestCount,
      failedCount,
      degradedCount,
      averageLatencyMs: Number(averageLatencyMs.toFixed(2)),
      p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
      chainDepth,
      blastRadiusCount,
      criticalityScore,
      safeDegradation,
      methodSeverity,
      targetServiceCount: targetServices.length
    }
  };
}

function summarizeRequestMetrics(responses) {
  const latencies = responses.map((item) => Number(item.latencyMs || 0));
  return {
    requestCount: responses.length,
    successfulRequests: responses.filter((item) => item.status === "approved").length,
    failedRequests: responses.filter((item) => item.outcome === "failed").length,
    degradedRequests: responses.filter((item) => item.degraded).length,
    fallbackUsed: responses.some((item) => item.degraded),
    averageLatencyMs: latencies.length
      ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      : 0,
    p95LatencyMs: percentile(latencies, 0.95),
    peakLatencyMs: latencies.length ? Math.max(...latencies) : 0
  };
}

module.exports = {
  classifyRiskLevel,
  computeRiskProfile,
  summarizeRequestMetrics
};
