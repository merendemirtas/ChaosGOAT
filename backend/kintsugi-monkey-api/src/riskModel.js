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

// Kalibrasyon: Google SRE Error Budget + Netflix Resilience Score yaklaşımı
// LOW  < 28 : Fallback çalıştı, kurtarma hızlı, blast radius dar, hata oranı < %20
// MEDIUM 28–50: Bozunma gözlemlendi, kurtarma kabul edilebilir, orta hata oranı
// HIGH > 50 : Tam kesinti, yüksek hata oranı (>%60), geniş blast radius veya kritik servis
const RISK_THRESHOLDS = {
  LOW: 28,
  MEDIUM: 50
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
  // Gerçek bozulma: başarısız + fallback'e düşen. Degraded = manuel review = bankacılık açısından risk
  const disruptedCount = failedCount + degradedCount;
  const averageLatencyMs = Number(summary.averageLatencyMs || experiment.average_latency_ms || 0);
  const p95LatencyMs = Number(summary.p95LatencyMs || experiment.p95_latency_ms || 0);
  const recoveryTimeMs = Number(experiment.recovery_time_ms || 0);
  // Gerçek runtime fallback kullanımına göre — statik mesaj alanı değil
  const safeDegradation = Boolean(summary.fallbackUsed || degradedCount > 0);
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
    // MTTR — Google SRE: kurtarma süresi kritik metrik
    // < 15s mükemmel, 15-60s iyi, 60-300s kabul edilebilir, > 300s sorunlu
    buildRiskMetric(
      "downtime",
      "MTTR (Kurtarma Süresi)",
      `${Math.round(recoveryTimeMs / 1000)}s`,
      recoveryTimeMs === 0 ? 0 : clamp(
        recoveryTimeMs < 15000  ? 8 :
        recoveryTimeMs < 30000  ? 18 :
        recoveryTimeMs < 60000  ? 32 :
        recoveryTimeMs < 120000 ? 50 :
        recoveryTimeMs < 300000 ? 70 : 90,
        0, 100
      ),
      0.20,
      "MTTR: Ortalama kurtarma süresi. Kısa kurtarma dayanıklılığı gösterir."
    ),
    // Kritiklik — düşük kritiklik servislerde risk doğal olarak düşer
    buildRiskMetric(
      "criticality",
      "Servis Kritikliği",
      targetService?.criticality || "MEDIUM",
      criticalityScore * 85,   // max 85 olacak şekilde normalize
      0.12,
      "Kritik servisler nihai risk skoruna daha fazla katkıda bulunur."
    ),
    // Blast radius — Netflix: etkilenen servis yüzdesi
    // Ağırlık artırıldı: cascade failures en önemli sinyallerden biri
    buildRiskMetric(
      "blast_radius",
      "Etki Alanı (Blast Radius)",
      blastRadiusCount,
      blastRadiusCount === 0 ? 5 :
      clamp((blastRadiusCount / Math.max(1, totalServices - 1)) * 100, 0, 100),
      0.20,
      "Etkilenen servis sayısı arttıkça patlama yarıçapı genişler."
    ),
    // Hata/bozunma oranı — failed + degraded birlikte değerlendiriliyor
    // Degraded (manuel review) da bankacılık açısından servis kesintisidir
    buildRiskMetric(
      "failure_rate",
      "Hata/Bozunma Oranı (%)",
      requestCount ? `${Math.round((disruptedCount / requestCount) * 100)}%` : "0%",
      requestCount > 0 ? normalizeRate(disruptedCount / requestCount, 1.5) : 0,
      0.25,
      "Başarısız + fallback'e düşen istek oranı. Yüksek değer servis kesintisine işaret eder.",
      requestCount > 0
    ),
    // Bozunma oranı — fallback'e düşen istek yüzdesi
    buildRiskMetric(
      "degradation_rate",
      "Bozunma Oranı (%)",
      requestCount ? `${Math.round((degradedCount / requestCount) * 100)}%` : "0%",
      requestCount > 0 ? normalizeRate(degradedCount / requestCount, 1.2) : 0,
      0.10,
      "Kullanıcıların fallback akışına yönlendirilme oranı.",
      requestCount > 0
    ),
    // P95 gecikme — SLO ihlal göstergesi
    buildRiskMetric(
      "latency_p95",
      "P95 Gecikme",
      `${Math.round(p95LatencyMs)}ms`,
      clamp((p95LatencyMs / 2000) * 100, 0, 100),
      0.08,
      "Kuyruk gecikmesi görünür kesintiden önce ortaya çıkar.",
      p95LatencyMs > 0 || averageLatencyMs > 0
    ),
    // Bağımlılık zinciri derinliği
    buildRiskMetric(
      "dependency_depth",
      "Bağımlılık Zinciri Derinliği",
      chainDepth,
      clamp((chainDepth / 4) * 100, 0, 100),
      0.06,
      "Derin zincirler aşağı akış yayılım riskini artırır."
    ),
    // Kaos metodu şiddeti
    buildRiskMetric(
      "method_severity",
      "Kaos Metodu Şiddeti",
      experiment.fault_type,
      methodSeverity * 100,
      0.06,
      "Bazı enjekte edilen arızalar doğası gereği daha şiddetlidir."
    ),
    // Eşzamanlı hedef sayısı
    buildRiskMetric(
      "simultaneous_targets",
      "Eşzamanlı Hedef Sayısı",
      targetServices.length,
      clamp((targetServices.length / 3) * 100, 0, 100),
      0.07,
      "Birden fazla servisi aynı anda kırmak risk skorunu hızlandırır.",
      targetServices.length > 0
    )
  ];

  // Safe degradation — fallback riski düşürür ama yüksek hata ortamını maskeleyemez
  // -0.10 → -0.07: LOW senaryolarda hâlâ etkili, HIGH senaryolarda dominantlığı kırılmaz
  const safeDegradationMetric = buildRiskMetric(
    "safe_degradation_relief",
    "Güvenli Bozunma Kalitesi",
    safeDegradation ? "aktif" : "pasif",
    safeDegradation ? 50 : 0,
    -0.07,
    "Etkin fallback, sistem güvenli kaldığı için nihai riski düşürür.",
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
