const { SAFE_DEGRADATION_MESSAGE } = require("./constants");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function buildGeminiPrompt(payload) {
  const riskProfile = payload.risk_profile || {};
  const computedScore = riskProfile.score ?? null;
  const computedLevel = riskProfile.level ?? null;
  const metrics = riskProfile.metrics || [];

  // Anahtar metrikleri özet olarak çıkar
  const mttr = metrics.find(m => m.name === "downtime");
  const failureRate = metrics.find(m => m.name === "failure_rate");
  const blastRadius = metrics.find(m => m.name === "blast_radius");
  const safeDeg = metrics.find(m => m.name === "safe_degradation_relief");

  const metricSummary = computedScore !== null ? `
DETERMINISTIK RİSK SKORU (riskModel.js çıktısı):
  - Hesaplanan Skor: ${computedScore.toFixed(1)} / 100
  - Eşik Değerleri: DÜŞÜK < 28, ORTA 28-50, YÜKSEK > 50
  - Model Kararı: ${computedLevel}
  - MTTR: ${mttr?.rawValue || "?"} (Normalize: ${mttr?.normalizedValue?.toFixed(0) || "?"})
  - Hata Oranı: ${failureRate?.rawValue || "0%"} (Normalize: ${failureRate?.normalizedValue?.toFixed(0) || "0"})
  - Blast Radius: ${blastRadius?.rawValue || 0} servis etkilendi
  - Safe Degradation: ${safeDeg?.rawValue || "pasif"}
` : "";

  return `Sen, bir bankacılık mikroservis sistemi için kıdemli bir SRE analistisin. Google SRE, Netflix Chaos Engineering ve AWS Resilience Hub metodolojilerini kullanıyorsun.

${metricSummary}

RİSK SEVİYESİ KILAVUZU (büyük şirketlerin kullandığı kriterler):
- DÜŞÜK (skor < 28): Kurtarma < 30s VE fallback çalıştı VE hata oranı < %20 VE yalnızca 1 servis etkilendi VE düşük/orta kritiklik → Sistem tasarlandığı gibi davrandı.
- ORTA (skor 28-50): Kurtarma 30s-3dk VEYA fallback tetiklendi ama tam değil VEYA hata oranı %20-60 VEYA 2 servis etkilendi → İyileştirme alanı var.
- YÜKSEK (skor > 50): Kurtarma > 3dk VEYA fallback yok/başarısız VEYA hata oranı > %50 VEYA 3+ kritik servis etkilendi VEYA yüksek kritiklik servisi tamamen çöktü → Acil aksiyon gerekli.

ÖNEMLİ: Deterministik skor ${computedLevel} gösteriyorsa sen de aynı seviyeyi kullan. Veriler DÜŞÜK risk gösteriyorsa DÜŞÜK yaz — kaos deneyi olduğu için otomatik olarak YÜKSEK yazma.

HATA OLASILĞI KURALLARI (her deneye özgü, gerçekçi):
- current_failure_probability: Gözlemlenen metriklere göre (MTTR, hata oranı, blast radius, fallback kalitesi) bu sistem bileşeninin benzer koşullarda arıza verme olasılığı. DÜŞÜK risk ise 5-25, ORTA ise 25-55, YÜKSEK ise 50-90 aralığında olmalı.
- improved_failure_probability: Öneriler uygulandıktan sonra beklenen olasılık. Mevcut değerden en az 12, en fazla 45 puan düşük olmalı.
- probability_reasoning: Deney verilerini (MTTR=${mttr?.rawValue || "?"}, hata oranı=${failureRate?.rawValue || "0%"}) referans alarak 1-2 cümle Türkçe açıklama.

Tüm alanları TÜRKÇE yaz. Yalnızca geçerli JSON döndür:
{
  "chaos_method_classification": "",
  "summary": "",
  "suspected_weak_point": "",
  "blast_radius": "",
  "risk_level": "DÜŞÜK | ORTA | YÜKSEK",
  "risk_level_reasoning": "",
  "safe_degradation_review": "",
  "developer_recommendations": [],
  "next_experiments": [],
  "kintsugi_lesson": "",
  "current_failure_probability": 0,
  "improved_failure_probability": 0,
  "probability_reasoning": ""
}

Deney yükü:
${JSON.stringify(payload, null, 2)}`;
}

function sanitizeJsonResponse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

function normalizeRiskLevel(level) {
  const map = {
    "LOW": "DÜŞÜK", "MEDIUM": "ORTA", "HIGH": "YÜKSEK",
    "DÜŞÜK": "DÜŞÜK", "ORTA": "ORTA", "YÜKSEK": "YÜKSEK",
    "low": "DÜŞÜK", "medium": "ORTA", "high": "YÜKSEK",
  };
  return map[level] || level || "ORTA";
}

function normalizeAnalysis(parsed, rawResponse) {
  return {
    chaos_method_classification: parsed.chaos_method_classification || "",
    summary: parsed.summary || "",
    suspected_weak_point: parsed.suspected_weak_point || "",
    blast_radius: parsed.blast_radius || "",
    risk_level: normalizeRiskLevel(parsed.risk_level),
    risk_level_reasoning: parsed.risk_level_reasoning || "",
    safe_degradation_review: parsed.safe_degradation_review || "",
    developer_recommendations: Array.isArray(parsed.developer_recommendations)
      ? parsed.developer_recommendations
      : [],
    next_experiments: Array.isArray(parsed.next_experiments)
      ? parsed.next_experiments
      : [],
    kintsugi_lesson: parsed.kintsugi_lesson || "",
    current_failure_probability: typeof parsed.current_failure_probability === "number"
      ? Math.min(99, Math.max(1, Math.round(parsed.current_failure_probability)))
      : null,
    improved_failure_probability: typeof parsed.improved_failure_probability === "number"
      ? Math.min(99, Math.max(1, Math.round(parsed.improved_failure_probability)))
      : null,
    probability_reasoning: parsed.probability_reasoning || "",
    raw_ai_response: rawResponse
  };
}

async function analyzeWithGemini(payload) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY eksik");
  }

  const modelsToTry = [...new Set([GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean))];
  let lastError;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildGeminiPrompt(payload) }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini isteği ${model} için ${response.status} durumuyla başarısız oldu`);
      }

      const result = await response.json();
      const rawText =
        result?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

      if (!rawText) {
        throw new Error(`Gemini ${model} için boş yanıt döndürdü`);
      }

      const parsed = JSON.parse(sanitizeJsonResponse(rawText));
      return normalizeAnalysis(parsed, JSON.stringify({ model, response: rawText }));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Gemini analizi başarısız oldu");
}

function buildFallbackAnalysis(payload) {
  const experiment = payload.experiment || {};
  const risk = payload.risk_profile || {};
  const methodName = experiment.fault_type || "service_kill";
  const affectedServices = experiment.affected_services || [];

  const methodLabels = {
    service_kill: "Servis Durdurma",
    network_delay: "Ağ Gecikmesi",
    packet_loss: "Paket Kaybı",
    cpu_stress: "CPU Baskısı",
    memory_stress: "Bellek Baskısı",
    partial_failure: "Kısmi Hata",
    cascade_kill: "Basamaklı Durdurma",
    db_disconnect: "Veritabanı Bağlantı Kesimi",
    cache_disconnect: "Önbellek Bağlantı Kesimi",
    traffic_surge: "Trafik Artışı",
  };

  const riskMap = { LOW: "DÜŞÜK", MEDIUM: "ORTA", HIGH: "YÜKSEK" };

  return {
    chaos_method_classification: `${methodLabels[methodName] || methodName} deneyi — dayanıklılık kategorisi`,
    summary: `${experiment.target_service || "Hedef servis"}, kontrollü bir ${methodLabels[methodName] || methodName} kaos senaryosuna maruz kaldı. Yukarı akış servisleri, mümkün olan durumlarda güvenli bozunma yollarına geçiş yaptı.`,
    suspected_weak_point:
      "En zayıf nokta, işlem doğrulama bileşenleri ile aşağı akış veri servisleri arasındaki çalışma zamanı bağımlılık zinciridir. Bu bağımlılık, tek bir servisin çökmesinin tüm işlem akışını etkilemesine yol açabilir.",
    blast_radius: `Etkilenen servisler: ${affectedServices.join(", ") || "yalnızca işlem-servisi"}. Manuel inceleme yedek davranışı sayesinde kullanıcı tarafındaki etki sınırlı tutuldu.`,
    risk_level: riskMap[risk.level] || "ORTA",
    risk_level_reasoning:
      "Risk, kesinti süresi, servis kritikliği, etki alanı, bozunan istek oranı, hata oranı, gecikme ve bağımlılık derinliği birleştirilerek belirlendi.",
    safe_degradation_review:
      "Yedek davranış, işlemler doğrulama yapılmadan otomatik onaylanmak yerine manuel incelemeye alındığından bankacılık açısından güvenli kaldı.",
    developer_recommendations: [
      "Zincirlenmiş bağımlılık çağrılarında zaman aşımı ve devre kesici eşiklerini ayarlayın.",
      "Gecikmiş ve kısmen başarısız bağımlılık senaryoları için bozunan yol testlerini genişletin.",
      "Yalnızca tam kesintilerde değil, bağımlılık derinliği sıcak noktalarında da uyarı verin.",
      "Her deney sırasında etki alanı, kuyruk gecikmesi ve yedek kullanım oranı gibi risk skoru girdilerini izleyin.",
      "Kuyruk davranışını doğrulamak için aynı deneyi eşzamanlı yük altında tekrar çalıştırın.",
    ],
    next_experiments: [
      "Kısmi bağımlılık başarısızlıklarını test etmek için aynı servise gecikme enjeksiyonu uygulayın.",
      "Yük altındaki kuyruk davranışını doğrulamak için yüksek eşzamanlılıkla deneyi tekrarlayın.",
      "Basamaklı etkiyi gözlemlemek için birden fazla bağımlı servisi aynı anda durdurun.",
      "Devre kesici devreye girdikten sonra kurtarma süresini ölçün.",
    ],
    kintsugi_lesson:
      "Bu kırık bize şunu öğretiyor: Güvenli bozunma, sistemin her zaman sağlıklıymış gibi davranmasından çok daha değerlidir. Kırıkları altınla sararak — yani güçlü yedek mekanizmalar inşa ederek — sistem, tek bir noktanın çökmesinin tüm akışı durdurmasını önleyebilir. Gerçek dayanıklılık, hiç kırılmamakta değil, kırılıp hızla toparlanmakta yatar.",
    current_failure_probability: _calcFallbackCurrentProb(experiment, payload),
    improved_failure_probability: _calcFallbackImprovedProb(experiment, payload),
    probability_reasoning: `Kurtarma süresi (${Math.round((experiment.recovery_time_ms || 60000) / 1000)}s) ve deney metrikleri temel alınarak hesaplandı. Önerilen 5 iyileştirme uygulandığında beklenen iyileşme oranı gösterilmektedir.`,
    raw_ai_response: JSON.stringify({
      kaynak: "yedek-analizci",
      guvenli_bozunma: experiment.safe_degradation || SAFE_DEGRADATION_MESSAGE
    })
  };
}

function _calcFallbackCurrentProb(experiment, payload) {
  // Google SRE / Netflix metodolojisi tabanlı gerçekçi hesaplama
  const riskProfile = payload.risk_profile || {};
  const riskScore = riskProfile.score;

  // Eğer riskModel.js skoru varsa onu kullan (en güvenilir kaynak)
  if (typeof riskScore === "number") {
    // Risk skoru 0-100 → olasılık 5-90 aralığına lineer map
    return Math.min(90, Math.max(5, Math.round(riskScore * 0.88 + 5)));
  }

  // Fallback: metriklerden hesapla
  const metrics = payload.service_metrics || [];
  const recMs = experiment.recovery_time_ms || 60000;
  const faultType = experiment.fault_type || "service_kill";
  const totalErrors = metrics.reduce((s, m) => s + (m.error_count || 0), 0);
  const totalSamples = metrics.reduce((s, m) => s + 5, 0) || 5;
  const errorRate = totalErrors / totalSamples;
  const fallbackUsed = metrics.some((m) => m.fallback_used);

  // MTTR tabanlı baz
  let prob = recMs < 15000 ? 12 : recMs < 30000 ? 22 : recMs < 60000 ? 35
           : recMs < 120000 ? 50 : recMs < 300000 ? 68 : 82;

  // Hata oranı etkisi
  prob += Math.round(errorRate * 25);

  // Fallback çalıştıysa anlamlı düşüş (Netflix: "fallback is gold")
  if (fallbackUsed) prob -= 18;

  // Hata tipi düzeltmesi
  const adjust = { cascade_kill: +12, service_kill: +5, db_disconnect: +8,
                   network_delay: -5, cache_disconnect: -8, traffic_surge: -3 };
  prob += adjust[faultType] || 0;

  return Math.min(90, Math.max(5, Math.round(prob)));
}

function _calcFallbackImprovedProb(experiment, payload) {
  const current = _calcFallbackCurrentProb(experiment, payload);
  const recs = (payload.developer_recommendations?.length || 5);
  // Her öneri ~3-4 puan iyileşme + baz iyileşme
  const reduction = Math.min(Math.round(current * 0.42 + recs * 2), 55);
  return Math.max(5, current - reduction);
}

module.exports = { analyzeWithGemini, buildFallbackAnalysis };
