import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";
import { ArrowRight } from "lucide-react";
import { api } from "../api";

function GaugeArc({ score = 0 }) {
  const r = 80; const cx = 110; const cy = 110;
  const startAngle = 210; const sweepAngle = 120;
  const toRad = (d) => (d * Math.PI) / 180;
  const angle = startAngle + (score / 100) * sweepAngle;
  const x1 = cx + r * Math.cos(toRad(210)); const y1 = cy + r * Math.sin(toRad(210));
  const x2 = cx + r * Math.cos(toRad(330)); const y2 = cy + r * Math.sin(toRad(330));
  const px = cx + r * Math.cos(toRad(angle)); const py = cy + r * Math.sin(toRad(angle));

  function arc(a1, a2, color, width = 10) {
    const pts = [];
    for (let a = a1; a <= a2; a += 2) {
      pts.push(`${cx + r * Math.cos(toRad(a))},${cy + r * Math.sin(toRad(a))}`);
    }
    return <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"/>;
  }

  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 35 ? "D" : "F";
  const gradeColor = score >= 70 ? "#22d3a0" : score >= 45 ? "#f0c040" : "#ff4d6d";

  return (
    <svg width={220} height={140} viewBox="0 0 220 140">
      {arc(210, 330, "rgba(255,255,255,0.06)", 12)}
      {score > 0 && arc(210, 210 + (score / 100) * 120, gradeColor, 12)}
      <circle cx={px} cy={py} r={8} fill={gradeColor} filter="url(#scoreGlow)"/>
      <defs>
        <filter id="scoreGlow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={36} fontWeight={800} fill={gradeColor} fontFamily="Inter">{score}</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize={13} fill="rgba(255,255,255,0.5)" fontFamily="Inter">/ 100</text>
      <text x={cx} y={cy - 20} textAnchor="middle" fontSize={24} fontWeight={800} fill={gradeColor} fontFamily="Inter">{grade}</text>
    </svg>
  );
}

function ScoreBar({ label, value, max = 25, color = "#f0c040" }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}/{max}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          transition: "width 0.8s ease",
          boxShadow: `0 0 8px ${color}60`,
        }}/>
      </div>
    </div>
  );
}

const TOOLTIP_STYLE = {
  background: "rgba(13,20,40,0.95)", border: "1px solid rgba(240,192,64,0.2)",
  borderRadius: 8, fontSize: 12, color: "white",
};

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [scores, setScores] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const exps = await api.experiments();
        setExperiments(exps || []);
        const completed = (exps || []).filter((e) => e.status === "completed" && e.recovery_time_ms);
        setSummary({
          system_score: completed.length > 0 ? Math.round(completed.reduce((s, e) => s + Math.min(100, Math.round(100 * (1 - Math.min(e.recovery_time_ms / 300000, 1)))), 0) / completed.length) : 0,
          total_experiments: (exps || []).length,
          by_service: Object.fromEntries(
            [...new Set((exps || []).map((e) => e.target_service))].map((name) => {
              const rel = (exps || []).filter((e) => e.target_service === name && e.recovery_time_ms);
              const avg = rel.length > 0 ? Math.round(rel.reduce((s, e) => s + Math.min(100, Math.round(100 * (1 - Math.min(e.recovery_time_ms / 300000, 1)))), 0) / rel.length) : 0;
              return [name, { latest: avg, average: avg, count: rel.length }];
            })
          ),
        });
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // Derive scores from experiments (recovery time based resilience score)
  const derivedScores = experiments
    .filter((e) => e.status === "completed" && e.recovery_time_ms != null)
    .map((e) => {
      const recMs = e.recovery_time_ms;
      const recScore = recMs < 10000 ? 25 : recMs < 30000 ? 20 : recMs < 60000 ? 12 : recMs < 180000 ? 6 : 0;
      const faultMult = { service_kill: 1.0, network_delay: 1.2, packet_loss: 1.3, cpu_stress: 1.4, partial_failure: 1.3, cascade_kill: 1.5 }[e.fault_type] || 1.0;
      return {
        name: e.target_service?.split("-")[0] || "?",
        service_name: e.target_service,
        fault_type: e.fault_type,
        score: Math.min(100, Math.round((recScore + 15 + 15 + 10) * faultMult)),
        recovery_time_ms: recMs,
      };
    });

  const chartData = derivedScores.slice(0, 10).reverse();

  const recoveryData = experiments.filter((e) => e.recovery_time_ms).slice(0, 8).reverse().map((e) => ({
    name: e.target_service?.split("-")[0] || "?",
    recovery: Math.round((e.recovery_time_ms || 0) / 1000),
  }));

  const navigate = useNavigate();
  const latestScore = derivedScores[0];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "white", marginBottom: 4 }}>Raporlar</h1>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 28 }}>Risk modeli ve etki metrikleri</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Risk Model */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
          <h3 style={{ color: "#f0c040", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 20, textTransform: "uppercase" }}>
            Sistem Resilience Skoru
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <GaugeArc score={summary?.system_score || 0}/>
            <div style={{ flex: 1 }}>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginBottom: 16 }}>
                Toplam deney: {summary?.total_experiments || 0}
              </p>
              {latestScore && (
                <>
                  <ScoreBar label="Kurtarma Hızı" value={latestScore.recovery_speed_score} color="#22d3a0"/>
                  <ScoreBar label="Yedek Kalitesi" value={latestScore.fallback_quality_score} color="#4a9eff"/>
                  <ScoreBar label="Etki Alanı" value={latestScore.blast_radius_score} color="#f0c040"/>
                  <ScoreBar label="Tespit Hızı" value={latestScore.detection_speed_score} color="#c084fc"/>
                </>
              )}
            </div>
          </div>
        </div>

        {/* By Service */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
          <h3 style={{ color: "#f0c040", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 20, textTransform: "uppercase" }}>
            Servis Bazlı Skorlar
          </h3>
          {summary?.by_service ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(summary.by_service).map(([name, s]) => {
                const grade = s.latest >= 85 ? "A" : s.latest >= 70 ? "B" : s.latest >= 55 ? "C" : s.latest >= 35 ? "D" : "F";
                const gc = s.latest >= 70 ? "#22d3a0" : s.latest >= 45 ? "#f0c040" : "#ff4d6d";
                return (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)", minWidth: 140 }}>{name}</span>
                    <div style={{ flex: 2, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.latest}%`, background: gc, borderRadius: 2 }}/>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: gc, minWidth: 30 }}>{s.latest}</span>
                    <span style={{ fontSize: 11, color: gc, fontWeight: 800, minWidth: 16 }}>{grade}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Skor yok</p>
          )}
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
          <h3 style={{ color: "#f0c040", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 20, textTransform: "uppercase" }}>
            Deney Skorları
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false}/>
                <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  formatter={(v) => [`${v} puan`, "Skor"]}/>
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.score >= 70 ? "#22d3a0" : entry.score >= 45 ? "#f0c040" : "#ff4d6d"}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>Veri yok</p>
          )}
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
          <h3 style={{ color: "#f0c040", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 20, textTransform: "uppercase" }}>
            Recovery Süresi Trendi (sn)
          </h3>
          {recoveryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={recoveryData}>
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}s`, "Kurtarma"]}/>
                <Line type="monotone" dataKey="recovery" stroke="#4a9eff" strokeWidth={2}
                  dot={{ fill: "#4a9eff", r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#4a9eff", boxShadow: "0 0 8px #4a9eff" }}/>
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>Veri yok</p>
          )}
        </div>
      </div>

      {/* Flow Button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <button onClick={() => {
          // Store trigger flag so AISuggestions auto-runs analysis
          sessionStorage.setItem("autoAnalyze", "true");
          navigate("/ai-suggests");
        }} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "13px 28px", borderRadius: 12, border: "1px solid rgba(240,192,64,0.35)",
          background: "rgba(240,192,64,0.08)", color: "#f0c040",
          fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
          transition: "all 0.2s",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,192,64,0.16)"; e.currentTarget.style.borderColor = "#f0c040"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(240,192,64,0.08)"; e.currentTarget.style.borderColor = "rgba(240,192,64,0.35)"; }}
        >
          AI'a Analiz Et <ArrowRight size={16}/>
        </button>
      </div>
    </div>
  );
}
