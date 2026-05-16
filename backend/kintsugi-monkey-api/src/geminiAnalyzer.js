const { SAFE_DEGRADATION_MESSAGE } = require("./constants");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function buildGeminiPrompt(payload) {
  return `You are a senior SRE and resilience analyst for a banking microservice system.

You will receive:
1. Chaos experiment metadata
2. Request / latency metrics
3. Dependency topology impact
4. A deterministic risk model output

Your task is to generate developer-facing recommendations.

Rules:
- Do not modify the system.
- Do not claim that you applied a fix.
- Do not produce code unless explicitly asked.
- Classify your explanation according to the applied chaos method.
- Use the supplied deterministic risk metrics when reasoning about severity.
- Keep the output useful for engineers reviewing a resilience incident after a hackathon demo.

Return only valid JSON with:
{
  "chaos_method_classification": "",
  "summary": "",
  "suspected_weak_point": "",
  "blast_radius": "",
  "risk_level": "LOW | MEDIUM | HIGH",
  "risk_level_reasoning": "",
  "safe_degradation_review": "",
  "developer_recommendations": []
}

Experiment payload:
${JSON.stringify(payload, null, 2)}`;
}

function sanitizeJsonResponse(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  }

  return trimmed;
}

function normalizeAnalysis(parsed, rawResponse) {
  return {
    chaos_method_classification: parsed.chaos_method_classification || "",
    summary: parsed.summary || "",
    suspected_weak_point: parsed.suspected_weak_point || "",
    blast_radius: parsed.blast_radius || "",
    risk_level: ["LOW", "MEDIUM", "HIGH"].includes(parsed.risk_level)
      ? parsed.risk_level
      : "MEDIUM",
    risk_level_reasoning: parsed.risk_level_reasoning || "",
    safe_degradation_review: parsed.safe_degradation_review || "",
    developer_recommendations: Array.isArray(parsed.developer_recommendations)
      ? parsed.developer_recommendations
      : [],
    raw_ai_response: rawResponse
  };
}

async function analyzeWithGemini(payload) {
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
                    text: buildGeminiPrompt(payload)
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

      const result = await response.json();
      const rawText =
        result?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

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

function buildFallbackAnalysis(payload) {
  const experiment = payload.experiment || {};
  const risk = payload.risk_profile || {};
  const methodName = experiment.fault_type || "service_kill";
  const affectedServices = experiment.affected_services || [];

  return {
    chaos_method_classification: `${methodName} experiment in the ${risk.category || "resilience"} category`,
    summary: `${experiment.target_service || "Target service"} experienced a controlled ${methodName} chaos scenario and upstream services switched into safe degradation paths where possible.`,
    suspected_weak_point:
      "The weakest point is the runtime dependency chain between transaction validation components and their downstream data services.",
    blast_radius: `Affected services: ${affectedServices.join(", ") || "transaction-service only"}. User-facing impact was limited by manual review fallback behavior.`,
    risk_level: risk.level || "MEDIUM",
    risk_level_reasoning:
      "Risk was determined by combining downtime, service criticality, blast radius, degraded request rate, failure rate, latency, and dependency depth.",
    safe_degradation_review:
      "The fallback behavior remained safe for banking because transactions were held for manual review instead of being auto-approved without validation.",
    developer_recommendations: [
      "Tune timeouts and circuit-breaker thresholds on chained dependency calls.",
      "Expand degraded-path tests for delayed and partially failing dependency scenarios.",
      "Alert on dependency-depth hotspots, not only on full outages.",
      "Monitor risk-score inputs such as blast radius, tail latency, and fallback rate during each experiment.",
      "Re-run the same experiment under concurrent load to validate queue behavior."
    ],
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
