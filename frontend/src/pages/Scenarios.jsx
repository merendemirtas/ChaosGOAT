import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, RotateCcw, Zap, ArrowRight, AlertTriangle } from "lucide-react";
import { api } from "../api";

const FLOW_STEPS = [
  { id: "limit",      label: "Limit",        service: "limit-service" },
  { id: "beneficiary",label: "Lehdar",       service: "beneficiary-service" },
  { id: "fraud",      label: "Dolandırıcılık",service: "fraud-check-service" },
  { id: "compliance", label: "Uyumluluk",    service: "compliance-service" },
  { id: "notify",     label: "Bildirim",     service: "notification-service" },
  { id: "approved",   label: "Tamamlandı",   service: null },
];

function Card({ title, children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: 24, marginBottom: 20,
    }}>
      <h3 style={{ color: "#f0c040", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 20, textTransform: "uppercase" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const c = { running: "#f0c040", completed: "#22d3a0", failed: "#ff4d6d" };
  const label = { running: "Devam Ediyor", completed: "Tamamlandı", failed: "Başarısız" };
  const col = c[status] || "#888";
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: col, background: `${col}18`, border: `1px solid ${col}30`,
    }}>{label[status] || status}</span>
  );
}

const CRITICALITY_COLOR = { HIGH: "#ff4d6d", MEDIUM: "#f0c040", LOW: "#22d3a0", CRITICAL: "#c084fc" };

function ServiceStatusGrid({ services }) {
  if (!services.length) return null;
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: 20, marginBottom: 20,
    }}>
      <h3 style={{ color: "#f0c040", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 16, textTransform: "uppercase" }}>
        Servis Durumları
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        {services.map((s) => {
          const isUp = s.status === "UP";
          const isDeg = s.status === "DEGRADED";
          const color = isUp ? "#22d3a0" : isDeg ? "#f0c040" : s.status === "DOWN" ? "#ff4d6d" : "#888";
          return (
            <div key={s.name} style={{
              background: `${color}0a`, border: `1px solid ${color}30`,
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", background: color,
                  boxShadow: isUp ? `0 0 6px ${color}` : "none",
                  display: "inline-block",
                }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.3 }}>{s.status}</span>
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
                {s.name.replace("-service", "")}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlowButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "13px 28px", borderRadius: 12, border: "1px solid rgba(240,192,64,0.35)",
      background: "rgba(240,192,64,0.08)", color: "#f0c040",
      fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
      transition: "all 0.2s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,192,64,0.16)"; e.currentTarget.style.borderColor = "#f0c040"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(240,192,64,0.08)"; e.currentTarget.style.borderColor = "rgba(240,192,64,0.35)"; }}
    >
      {label} <ArrowRight size={16}/>
    </button>
  );
}

export default function Scenarios() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [methods, setMethods] = useState([]);
  const [selectedService, setSelectedService] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [config, setConfig] = useState({});
  const [experiments, setExperiments] = useState([]);
  const [running, setRunning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "info" });

  const availableServices = selectedMethod
    ? (methods.find((m) => m.code === selectedMethod)?.supportedTargets || [])
    : [];

  async function load() {
    try {
      const [health, exps, cm] = await Promise.all([api.health(), api.experiments(), api.chaosMethods()]);
      setServices(health.services || []);
      setExperiments(exps || []);
      setMethods(cm.methods || cm || []);
      const r = (exps || []).find((e) => e.status === "running");
      setRunning(r || null);
    } catch (_) {}
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  // Auto-select first service when method changes
  useEffect(() => {
    if (availableServices.length > 0 && !availableServices.includes(selectedService)) {
      setSelectedService(availableServices[0]);
    }
  }, [selectedMethod, availableServices]);

  async function inject() {
    if (!selectedMethod || !selectedService) {
      setMsg({ text: "Servis ve kaos metodu seçiniz.", type: "error" });
      return;
    }
    setLoading(true); setMsg({ text: "", type: "info" });
    try {
      await api.inject({ service: selectedService, fault_type: selectedMethod, config });
      setMsg({ text: "✓ Kaos başlatıldı.", type: "success" });
      await load();
    } catch (e) { setMsg({ text: `Hata: ${e.message}`, type: "error" }); }
    setLoading(false);
  }

  async function recover() {
    setRecovering(true); setMsg({ text: "", type: "info" });
    try {
      await api.recover(running?.id);
      setMsg({ text: "✓ Servis kurtarıldı.", type: "success" });
      await load();
    } catch (e) { setMsg({ text: `Hata: ${e.message}`, type: "error" }); }
    setRecovering(false);
  }

  const statusMap = {};
  services.forEach((s) => { statusMap[s.name] = s.status; });

  const latest = experiments[0] || null;
  const selectedMethodObj = methods.find((m) => m.code === selectedMethod);
  const [expPage, setExpPage] = useState(1);
  const visibleExps = experiments.slice(0, expPage * 5);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "white", marginBottom: 4 }}>Senaryolar</h1>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>Kaos mühendisliği kontrol paneli</p>

      {/* Service Status */}
      <ServiceStatusGrid services={services}/>

      {/* Transaction Flow */}
      <Card title="İşlem Akışı">
        <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 8 }}>
          {FLOW_STEPS.map((step, i) => {
            const status = step.service ? (statusMap[step.service] || "UNKNOWN") : "UP";
            const color = status === "UP" ? "#22d3a0" : status === "DOWN" ? "#ff4d6d" : status === "DEGRADED" ? "#f0c040" : "#888";
            return (
              <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
                <div style={{
                  background: `${color}14`,
                  border: `1.5px solid ${color}`,
                  borderRadius: 10, padding: "10px 14px", minWidth: 90, textAlign: "center",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.5 }}>{step.label}</div>
                  {step.service && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{status}</div>}
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div style={{ width: 28, height: 2, background: `${color}50`, position: "relative" }}>
                    <div style={{
                      position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                      borderLeft: `6px solid ${color}`, borderTop: "4px solid transparent", borderBottom: "4px solid transparent",
                    }}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Chaos Engine */}
        <Card title="Kaos Motoru">
          {running && (
            <div style={{
              background: "rgba(240,192,64,0.08)", border: "1px solid rgba(240,192,64,0.3)",
              borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10,
            }}>
              <Zap size={14} color="#f0c040"/>
              <span style={{ color: "#f0c040", fontSize: 12, fontWeight: 600 }}>
                Aktif: {running.target_service} — {running.fault_type}
              </span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Method selector */}
            <div>
              <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 6, display: "block", letterSpacing: 0.5 }}>KAOS METODU</label>
              <select
                value={selectedMethod}
                onChange={(e) => { setSelectedMethod(e.target.value); setConfig({}); }}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, padding: "9px 12px", color: "white", fontSize: 13,
                }}>
                <option value="" style={{ background: "#0d1428" }}>-- Metod Seçiniz --</option>
                {methods.map((m) => (
                  <option key={m.code} value={m.code} style={{ background: "#0d1428" }}>
                    {m.label} [{m.category}]
                  </option>
                ))}
              </select>
              {selectedMethodObj && (
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                  {selectedMethodObj.description}
                </p>
              )}
            </div>

            {/* Service selector — updates based on method */}
            {selectedMethod && (
              <div>
                <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 6, display: "block", letterSpacing: 0.5 }}>
                  HEDEF SERVİS
                </label>
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8, padding: "9px 12px", color: "white", fontSize: 13,
                  }}>
                  {availableServices.map((s) => (
                    <option key={s} value={s} style={{ background: "#0d1428" }}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Config by method type */}
            {selectedMethod === "network_delay" && (
              <div>
                <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 6, display: "block" }}>
                  GECİKME: {config.latencyMs || 1200}ms
                </label>
                <input type="range" min={300} max={5000} step={100}
                  value={config.latencyMs || 1200}
                  onChange={(e) => setConfig({ ...config, latencyMs: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "#f0c040" }}/>
              </div>
            )}

            {selectedMethod === "packet_loss" && (
              <div>
                <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 6, display: "block" }}>
                  KAYIP ORANI: %{Math.round((config.packetLossRate || 0.35) * 100)}
                </label>
                <input type="range" min={0.1} max={1} step={0.05}
                  value={config.packetLossRate || 0.35}
                  onChange={(e) => setConfig({ ...config, packetLossRate: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "#f0c040" }}/>
              </div>
            )}

            {selectedMethod === "cpu_stress" && (
              <div>
                <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 6, display: "block" }}>
                  CPU STRES: {config.cpuStressMs || 450}ms/istek
                </label>
                <input type="range" min={100} max={2000} step={50}
                  value={config.cpuStressMs || 450}
                  onChange={(e) => setConfig({ ...config, cpuStressMs: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "#f0c040" }}/>
              </div>
            )}

            {selectedMethod === "partial_failure" && (
              <div>
                <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 6, display: "block" }}>
                  HATA ORANI: %{Math.round((config.partialFailureRate || 0.7) * 100)}
                </label>
                <input type="range" min={0.1} max={1} step={0.1}
                  value={config.partialFailureRate || 0.7}
                  onChange={(e) => setConfig({ ...config, partialFailureRate: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "#f0c040" }}/>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={inject} disabled={loading || !!running || !selectedMethod}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "none",
                  cursor: (loading || running || !selectedMethod) ? "not-allowed" : "pointer",
                  background: loading
                    ? "rgba(255,77,109,0.2)"
                    : (running || !selectedMethod)
                      ? "rgba(255,255,255,0.06)"
                      : "linear-gradient(135deg,#ff4d6d,#c0213a)",
                  color: (running || !selectedMethod) ? "rgba(255,255,255,0.3)" : "white",
                  fontWeight: 700, fontSize: 13,
                  boxShadow: (!running && selectedMethod && !loading) ? "0 0 20px rgba(255,77,109,0.25)" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "all 0.2s",
                }}>
                {loading ? (
                  <>
                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#ff4d6d", animation: "spin 0.8s linear infinite" }}/>
                    Başlatılıyor...
                  </>
                ) : (
                  <><Play size={13}/> Chaos Başlat</>
                )}
              </button>
              <button onClick={recover} disabled={recovering || !running}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "none",
                  cursor: (!running || recovering) ? "not-allowed" : "pointer",
                  background: recovering
                    ? "rgba(34,211,160,0.15)"
                    : !running
                      ? "rgba(255,255,255,0.04)"
                      : "linear-gradient(135deg,#22d3a0,#0e9e78)",
                  color: !running ? "rgba(255,255,255,0.25)" : "white",
                  fontWeight: 700, fontSize: 13,
                  boxShadow: (running && !recovering) ? "0 0 20px rgba(34,211,160,0.2)" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "all 0.2s",
                }}>
                {recovering ? (
                  <>
                    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#22d3a0", animation: "spin 0.8s linear infinite" }}/>
                    Kurtarılıyor...
                  </>
                ) : (
                  <><RotateCcw size={13}/> Kurtar</>
                )}
              </button>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {msg.text && (
              <p style={{
                color: msg.type === "error" ? "#ff4d6d" : msg.type === "success" ? "#22d3a0" : "#f0c040",
                fontSize: 12, textAlign: "center",
              }}>{msg.text}</p>
            )}
          </div>
        </Card>

        {/* Latest Experiment */}
        <Card title="Son Deney">
          {latest ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "monospace" }}>
                  {latest.id?.slice(-14)}
                </span>
                <StatusBadge status={latest.status}/>
              </div>
              {[
                { label: "Hedef Servis", value: latest.target_service },
                { label: "Kaos Metodu", value: latest.fault_type },
                { label: "Etkilenen", value: latest.affected_service },
                { label: "Kurtarma Süresi", value: latest.recovery_time_ms ? `${(latest.recovery_time_ms / 1000).toFixed(1)}s` : "—" },
                { label: "Başlangıç", value: latest.started_at ? new Date(latest.started_at).toLocaleTimeString("tr-TR") : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8,
                }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{label}</span>
                  <span style={{ color: "white", fontSize: 12, fontWeight: 500, maxWidth: 200, textAlign: "right" }}>{value || "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              Henüz deney yok
            </p>
          )}
        </Card>
      </div>

      {/* Experiment History */}
      <Card title="Deney Geçmişi">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["ID", "Hedef", "Metod", "Durum", "Kurtarma", "Tarih"].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 11, letterSpacing: 0.5,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleExps.map((e) => (
                <tr key={e.id}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace", fontSize: 10 }}>
                    {e.id?.slice(-12)}
                  </td>
                  <td style={{ padding: "10px 12px", color: "white", fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.target_service}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#4a9eff" }}>{e.fault_type}</td>
                  <td style={{ padding: "10px 12px" }}><StatusBadge status={e.status}/></td>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.6)" }}>
                    {e.recovery_time_ms ? `${(e.recovery_time_ms / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                    {e.created_at ? new Date(e.created_at).toLocaleString("tr-TR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {experiments.length === 0 && (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
              Deney geçmişi yok
            </p>
          )}
          {experiments.length > visibleExps.length && (
            <div style={{ textAlign: "center", paddingTop: 14 }}>
              <button onClick={() => setExpPage((p) => p + 1)} style={{
                padding: "8px 24px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)",
                fontSize: 12, cursor: "pointer",
              }}>
                Daha fazla göster ({experiments.length - visibleExps.length} kaldı)
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Flow Button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <FlowButton label="Sonuçları Gör" onClick={() => navigate("/reports")}/>
      </div>
    </div>
  );
}
