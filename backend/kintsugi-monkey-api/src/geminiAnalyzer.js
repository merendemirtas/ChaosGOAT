const { SAFE_DEGRADATION_MESSAGE } = require("./constants");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function buildGeminiPrompt(metrics) {
  return `You are a senior SRE and resilience analyst for a banking microservice system.

You will receive chaos engineering experiment metrics.
Your task is to generate developer-facing recommendations.

Do not modify the system.
Do not claim that you applied a fix.
Do not produce code unless explicitly asked.
Focus on:
- root cause hypothesis
- blast radius
- resilience risk
- safe degradation
- developer recommendations
- prevention steps
- Kintsugi-style learning: what this fracture teaches the system

Return only valid JSON with:
{
  "summary": "",
  "suspected_weak_point": "",
  "blast_radius": "",
  "risk_level": "LOW | MEDIUM | HIGH",
  "safe_degradation_review": "",
  "developer_recommendations": [],
  "next_experiments": [],
  "kintsugi_lesson": ""
}

Experiment metrics:
${JSON.stringify(metrics, null, 2)}`;
}

function sanitizeJsonResponse(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  }

  return trimmed;
}

function normalizeAnalysis(parsed, raw_ai_response) {
  return {
    summary: parsed.summary || "",
    suspected_weak_point: parsed.suspected_weak_point || "",
    blast_radius: parsed.blast_radius || "",
    risk_level: ["LOW", "MEDIUM", "HIGH"].includes(parsed.risk_level)
      ? parsed.risk_level
      : "MEDIUM",
    safe_degradation_review: parsed.safe_degradation_review || "",
    developer_recommendations: Array.isArray(parsed.developer_recommendations)
      ? parsed.developer_recommendations
      : [],
    next_experiments: Array.isArray(parsed.next_experiments) ? parsed.next_experiments : [],
    kintsugi_lesson: parsed.kintsugi_lesson || "",
    raw_ai_response
  };
}

async function analyzeWithGemini(metrics) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const modelsToTry = [...new Set([GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean))];
  let lastError;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: buildGeminiPrompt(metrics)
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini request failed for ${model} with status ${response.status}`);
      }

      const payload = await response.json();
      const rawText =
        payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

      if (!rawText) {
        throw new Error(`Gemini returned an empty response for ${model}`);
      }

      const parsed = JSON.parse(sanitizeJsonResponse(rawText));
      return normalizeAnalysis(parsed, JSON.stringify({ model, response: rawText }));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Gemini analysis failed");
}

function buildFallbackAnalysis(metrics) {
  const experiment = metrics.experiment || {};
  const serviceMetrics = metrics.service_metrics || [];
  const aggregate = serviceMetrics[0] || {};
  const degradedCount = Number(aggregate.degraded_count || 0);
  const failedRequests = Number(aggregate.failed_requests || 0);
  const riskLevel = degradedCount > 0 || failedRequests > 0 ? "HIGH" : "MEDIUM";

  return {
    summary: `${experiment.target_service || "fraud-check-service"} was intentionally stopped during a controlled chaos experiment.`,
    suspected_weak_point:
      "transaction-service has a critical runtime dependency on fraud-check-service.",
    blast_radius:
      "transaction-service entered degraded mode. Transactions were moved to manual review instead of auto-approval.",
    risk_level: riskLevel,
    safe_degradation_review:
      "The fallback behavior is safe for banking because it avoids approving transactions without fraud verification.",
    developer_recommendations: [
      "Add timeout between transaction-service and fraud-check-service",
      "Use circuit breaker to prevent cascading failures",
      "Create a manual review queue for fraud-check outages",
      "Add alerting for fraud-check-service downtime",
      "Test pending_review workflow under load"
    ],
    next_experiments: [
      "Inject latency into fraud-check-service",
      "Simulate notification-service outage during pending review",
      "Test transaction-service under concurrent degraded requests"
    ],
    kintsugi_lesson:
      "This fracture shows that safe degradation is more valuable than pretending the system is always healthy.",
    raw_ai_response: JSON.stringify({
      source: "fallback-analyzer",
      safe_degradation: experiment.safe_degradation || SAFE_DEGRADATION_MESSAGE
    })
  };
}

module.exports = {
  analyzeWithGemini,
  buildFallbackAnalysis
};
