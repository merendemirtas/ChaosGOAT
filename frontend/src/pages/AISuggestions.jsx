import { useEffect, useState } from "react";
import { Brain, Sparkles, AlertTriangle, Shield, Target, Lightbulb, ChevronDown, ChevronUp, Loader, TrendingUp } from "lucide-react";
import { api } from "../api";

const RISK_COLOR = { HIGH: "#ff4d6d", MEDIUM: "#f0c040", LOW: "#22d3a0", CRITICAL: "#c084fc" };

function RiskBadge({ level }) {
  const c = RISK_COLOR[level] || "#888";
  const labels = { HIGH: "YÜKSEK", MEDIUM: "ORTA", LOW: "DÜŞÜK", CRITICAL: "KRİTİK" };
  return (
    <span style={{
      padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: c, background: `${c}18`, border: `1px solid ${c}40`,
    }}>{labels[level] || level || "—"}</span>
  );
}

function AnalyzerBadge({ analyzer }) {
  const isGemini = analyzer === "gemini";
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      color: isGemini ? "#4a9eff" : "#888",
      background: isGemini ? "rgba(74,158,255,0.1)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${isGemini ? "#4a9eff30" : "#ffffff15"}`,
    }}>
      {isGemini ? "✦ Gemini Yapay Zeka" : "Yedek Analiz"}
    </span>
  );
}

function Section({ icon, title, color = "#4a9eff", children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {icon}
        <p style={{ color, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function TraceCard({ trace, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const recs = trace.developer_recommendations || [];
  const nextExps = trace.next_experiments || [];

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, overflow: "hidden",
      borderLeft: `3px solid ${RISK_COLOR[trace.risk_level] || "#888"}`,
    }}>
      {/* Header */}
      <button onClick={() => setOpen((o) => !o)} style={{
        width: "100%", padding: "18px 20px", background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, textAlign: "left",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <RiskBadge level={trace.risk_level}/>
            <AnalyzerBadge analyzer={trace.analyzer}/>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace" }}>
              #{trace.experiment_id?.slice(-10)}
            </span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>
              {trace.created_at ? new Date(trace.created_at).toLocaleString("tr-TR") : ""}
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 1.5, fontWeight: 500 }}>
            {trace.summary}
          </p>
        </div>
        {open ? <ChevronUp size={16} color="rgba(255,255,255,0.4)"/> : <ChevronDown size={16} color="rgba(255,255,255,0.4)"/>}
      </button>

      {/* Detail */}
      {open && (
        <div style={{ padding: "0 20px 24px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>

          {/* Zayıf Nokta */}
          <div style={{ marginTop: 18 }}>
            <Section icon={<AlertTriangle size={13} color="#ff4d6d"/>} title="Zayıf Nokta" color="#ff4d6d">
              <div style={{
                background: "rgba(255,77,109,0.07)", border: "1px solid rgba(255,77,109,0.18)",
                borderRadius: 10, padding: "12px 16px",
              }}>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.7 }}>
                  {trace.suspected_weak_point}
                </p>
              </div>
            </Section>
          </div>

          {/* Etki Alanı */}
          <Section icon={<Target size={13} color="#f0c040"/>} title="Etki Alanı" color="#f0c040">
            <div style={{
              background: "rgba(240,192,64,0.06)", border: "1px solid rgba(240,192,64,0.15)",
              borderRadius: 10, padding: "12px 16px",
            }}>
              <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.7 }}>
                {trace.blast_radius}
              </p>
            </div>
          </Section>

          {/* Güvenli Degradasyon */}
          <Section icon={<Shield size={13} color="#22d3a0"/>} title="Güvenli Degradasyon Değerlendirmesi" color="#22d3a0">
            <div style={{
              background: "rgba(34,211,160,0.06)", border: "1px solid rgba(34,211,160,0.15)",
              borderRadius: 10, padding: "12px 16px",
            }}>
              <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.7 }}>
                {trace.safe_degradation_review}
              </p>
            </div>
          </Section>

          {/* Geliştirici Önerileri */}
          {recs.length > 0 && (
            <Section icon={<Lightbulb size={13} color="#4a9eff"/>} title="Geliştirici Önerileri" color="#4a9eff">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recs.map((r, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    background: "rgba(74,158,255,0.05)", borderRadius: 8, padding: "10px 14px",
                    border: "1px solid rgba(74,158,255,0.12)",
                  }}>
                    <span style={{
                      minWidth: 22, height: 22, borderRadius: "50%",
                      background: "rgba(74,158,255,0.2)", color: "#4a9eff",
                      fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{i + 1}</span>
                    <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, lineHeight: 1.6 }}>{r}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Sonraki Deneyler */}
          {nextExps.length > 0 && (
            <Section icon={<TrendingUp size={13} color="#c084fc"/>} title="Sonraki Deneyler" color="#c084fc">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {nextExps.map((e, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "8px 12px", borderRadius: 8,
                    background: "rgba(192,132,252,0.05)", border: "1px solid rgba(192,132,252,0.12)",
                  }}>
                    <span style={{ color: "#c084fc", fontSize: 11, fontWeight: 700, minWidth: 16 }}>→</span>
                    <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.5 }}>{e}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Kintsugi Dersi */}
          {trace.kintsugi_lesson && (
            <div style={{
              padding: "16px 20px",
              background: "linear-gradient(135deg, rgba(240,192,64,0.07), rgba(240,192,64,0.03))",
              border: "1px solid rgba(240,192,64,0.2)",
              borderLeft: "3px solid #f0c040",
              borderRadius: "0 12px 12px 0",
            }}>
              <p style={{ color: "#f0c040", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>
                ✦ Kintsugi Dersi
              </p>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.8, fontStyle: "italic" }}>
                {trace.kintsugi_lesson}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AISuggestions() {
  const [traces, setTraces] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [analyzeError, setAnalyzeError] = useState("");
  const [tracePage, setTracePage] = useState(1);

  async function load() {
    try {
      const [t, e] = await Promise.all([api.goldenTraces(), api.experiments()]);
      setTraces(t || []); setExperiments(e || []);
      return e || [];
    } catch (_) { return []; }
  }

  useEffect(() => {
    (async () => {
      const exps = await load();
      // Auto-trigger if redirected from Reports with flag
      if (sessionStorage.getItem("autoAnalyze") === "true") {
        sessionStorage.removeItem("autoAnalyze");
        const completed = exps.find((e) => e.status === "completed");
        if (completed) {
          setAnalyzing(true);
          try {
            const result = await api.analyze(completed.id);
            setAnalyzeResult(result);
            await load();
          } catch (e) { setAnalyzeError(e.message); }
          setAnalyzing(false);
        }
      }
    })();
  }, []);

  const latestCompleted = experiments.find((e) => e.status === "completed");
  const visibleTraces = traces.slice(0, tracePage * 5);

  async function analyze() {
    if (!latestCompleted) return;
    setAnalyzing(true); setAnalyzeError(""); setAnalyzeResult(null);
    try {
      const result = await api.analyze(latestCompleted.id);
      setAnalyzeResult(result);
      await load();
    } catch (e) { setAnalyzeError(e.message); }
    setAnalyzing(false);
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "white", marginBottom: 4 }}>Yapay Zeka Önerileri</h1>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 28 }}>Gemini analizi ve Golden Trace geçmişi</p>

      {/* Analyze Section */}
      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(74,158,255,0.2)",
        borderRadius: 16, padding: 24, marginBottom: 28,
      }}>
        <h3 style={{
          color: "#4a9eff", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 20,
          textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8,
        }}>
          <Sparkles size={15}/> Gemini Analizi
        </h3>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: analyzeResult || analyzeError ? 20 : 0 }}>
          <div style={{ flex: 1 }}>
            {latestCompleted ? (
              <div style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 16px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginBottom: 4, letterSpacing: 0.5 }}>ANALİZ EDİLECEK DENEY</p>
                <p style={{ color: "white", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{latestCompleted.id}</p>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  {latestCompleted.target_service} — <span style={{ color: "#4a9eff" }}>{latestCompleted.fault_type}</span>
                  {latestCompleted.recovery_time_ms && (
                    <span style={{ color: "#22d3a0", marginLeft: 8 }}>
                      {(latestCompleted.recovery_time_ms / 1000).toFixed(1)}s recovery
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Tamamlanmış deney bulunamadı</p>
            )}
          </div>

          <button onClick={analyze} disabled={analyzing || !latestCompleted} style={{
            padding: "13px 28px", borderRadius: 10, border: "none",
            background: !latestCompleted ? "rgba(255,255,255,0.05)"
              : analyzing ? "rgba(74,158,255,0.15)"
              : "linear-gradient(135deg, #4a9eff, #2563eb)",
            color: !latestCompleted ? "rgba(255,255,255,0.3)" : "white",
            fontWeight: 700, fontSize: 13, cursor: latestCompleted ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
            transition: "all 0.2s",
          }}>
            {analyzing ? (
              <>
                <Loader size={15} style={{ animation: "spin 1s linear infinite" }}/>
                Analiz ediliyor...
              </>
            ) : (
              <>
                <Brain size={15}/>
                Son Deneyi Analiz Et
              </>
            )}
          </button>
        </div>

        {analyzeError && (
          <div style={{
            background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.25)",
            borderRadius: 10, padding: "12px 16px",
          }}>
            <p style={{ color: "#ff4d6d", fontSize: 12 }}>Hata: {analyzeError}</p>
          </div>
        )}

        {analyzeResult && (
          <div style={{
            background: "rgba(74,158,255,0.04)", border: "1px solid rgba(74,158,255,0.18)",
            borderRadius: 12, padding: 20, marginTop: 4,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <p style={{ color: "#22d3a0", fontSize: 13, fontWeight: 700 }}>✓ Analiz Tamamlandı</p>
              <div style={{ display: "flex", gap: 8 }}>
                <RiskBadge level={analyzeResult.risk_level}/>
                <AnalyzerBadge analyzer={analyzeResult.analyzer}/>
              </div>
            </div>
            {/* Inline full trace */}
            <TraceCard trace={{ ...analyzeResult, experiment_id: latestCompleted?.id }} defaultOpen={true}/>
          </div>
        )}
      </div>

      {/* Golden Trace History */}
      <div>
        <h3 style={{
          color: "#f0c040", fontSize: 13, fontWeight: 600, letterSpacing: 1,
          marginBottom: 16, textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Brain size={15}/> Altın İz Geçmişi ({traces.length})
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {traces.length === 0 ? (
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, padding: "40px", textAlign: "center",
            }}>
              <Brain size={32} color="rgba(255,255,255,0.1)" style={{ marginBottom: 12 }}/>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Henüz analiz yapılmamış</p>
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginTop: 4 }}>Yukarıdaki butonu kullanarak ilk Gemini analizini başlat</p>
            </div>
          ) : (
            visibleTraces.map((t) => <TraceCard key={t.id} trace={t}/>)
          )}
        </div>

        {traces.length > visibleTraces.length && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => setTracePage((p) => p + 1)} style={{
              padding: "9px 28px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)",
              fontSize: 12, cursor: "pointer",
            }}>
              Daha fazla göster ({traces.length - visibleTraces.length} kaldı)
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
