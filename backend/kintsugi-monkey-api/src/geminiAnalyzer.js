const { SAFE_DEGRADATION_MESSAGE } = require("./constants");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function buildGeminiPrompt(payload) {
  return `Sen, bir bankacılık mikroservis sistemi için kıdemli bir SRE (Site Reliability Engineer) ve dayanıklılık analistisin.

Aşağıdakileri alacaksın:
1. Kaos deneyi meta verileri
2. İstek / gecikme metrikleri
3. Bağımlılık topolojisi etkisi
4. Deterministik risk modeli çıktısı

Görevin, geliştiriciye yönelik Türkçe öneriler üretmektir.

Kurallar:
- Sistemi değiştirme.
- Herhangi bir düzeltme uyguladığını iddia etme.
- Açıkça istenmedikçe kod üretme.
- Açıklamanı uygulanan kaos metoduna göre sınıflandır.
- Önem derecesi hakkında akıl yürütürken sağlanan deterministik risk metriklerini kullan.
- Çıktıyı bir hackathon demosundan sonra dayanıklılık olayını inceleyen mühendisler için faydalı tut.
- TÜM ALANLARI TÜRKÇE YAZ. Hiçbir alanda İngilizce kullanma.
- next_experiments ve developer_recommendations listelerindeki tüm maddeler Türkçe olmalıdır.
- kintsugi_lesson alanı mutlaka Türkçe olmalıdır.

Yalnızca geçerli JSON döndür:
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
  "kintsugi_lesson": ""
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
    raw_ai_response: JSON.stringify({
      kaynak: "yedek-analizci",
      guvenli_bozunma: experiment.safe_degradation || SAFE_DEGRADATION_MESSAGE
    })
  };
}

module.exports = { analyzeWithGemini, buildFallbackAnalysis };
