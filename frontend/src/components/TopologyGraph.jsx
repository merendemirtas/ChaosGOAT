import { useMemo } from "react";

const NODES = [
  { id: "account-service",      label: "Hesap",      x: 420, y: 60,  criticality: "HIGH" },
  { id: "limit-service",        label: "Limit",        x: 160, y: 200, criticality: "HIGH" },
  { id: "beneficiary-service",  label: "Lehdar",  x: 420, y: 200, criticality: "HIGH" },
  { id: "compliance-service",   label: "Uyumluluk",   x: 680, y: 200, criticality: "HIGH" },
  { id: "transaction-service",  label: "İşlem",  x: 420, y: 360, criticality: "HIGH" },
  { id: "notification-service", label: "Bildirim", x: 720, y: 360, criticality: "LOW" },
  { id: "fraud-check-service",  label: "Dolandırıcılık",  x: 180, y: 360, criticality: "HIGH" },
  { id: "risk-profile-service", label: "Risk Profili", x: 60,  y: 480, criticality: "MEDIUM" },
];

const EDGES = [
  { from: "transaction-service",  to: "fraud-check-service",  label: "Dolandırıcılık Kontrolü" },
  { from: "transaction-service",  to: "limit-service",        label: "Limit Kontrolü" },
  { from: "transaction-service",  to: "beneficiary-service",  label: "Doğrulama" },
  { from: "transaction-service",  to: "compliance-service",   label: "Uyumluluk" },
  { from: "transaction-service",  to: "notification-service", label: "Bildirim" },
  { from: "fraud-check-service",  to: "risk-profile-service", label: "Risk Sorgusu" },
  { from: "limit-service",        to: "account-service",      label: "Hesap" },
  { from: "beneficiary-service",  to: "account-service",      label: "Hesap" },
  { from: "compliance-service",   to: "account-service",      label: "Hesap" },
];

function nodeColor(status) {
  if (status === "UP") return { fill: "rgba(34,211,160,0.15)", stroke: "#22d3a0", dot: "#22d3a0" };
  if (status === "DOWN") return { fill: "rgba(255,77,109,0.15)", stroke: "#ff4d6d", dot: "#ff4d6d" };
  if (status === "DEGRADED") return { fill: "rgba(240,192,64,0.15)", stroke: "#f0c040", dot: "#f0c040" };
  return { fill: "rgba(255,255,255,0.05)", stroke: "rgba(255,255,255,0.2)", dot: "#888" };
}

function Arrow({ from, to }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len; const uy = dy / len;
  const r = 34;
  const x1 = from.x + ux * r; const y1 = from.y + uy * r;
  const x2 = to.x - ux * (r + 8); const y2 = to.y - uy * (r + 8);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="rgba(240,192,64,0.25)" strokeWidth={1.5} strokeDasharray="4 3"/>
      <polygon
        points={`${x2},${y2} ${x2 - ux * 8 + uy * 4},${y2 - uy * 8 - ux * 4} ${x2 - ux * 8 - uy * 4},${y2 - uy * 8 + ux * 4}`}
        fill="rgba(240,192,64,0.5)"
      />
    </g>
  );
}

export default function TopologyGraph({ services = [] }) {
  const statusMap = useMemo(() => {
    const m = {};
    services.forEach((s) => { m[s.name] = s.status; });
    return m;
  }, [services]);

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: 24, overflowX: "auto",
    }}>
      <h3 style={{ color: "#f0c040", fontSize: 14, fontWeight: 600, marginBottom: 16, letterSpacing: 1 }}>
        SERVİS TOPOLOJİSİ
      </h3>
      <svg width="100%" viewBox="0 0 800 560" style={{ maxWidth: 800, display: "block", margin: "0 auto" }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {EDGES.map((e, i) => {
          const fromNode = NODES.find((n) => n.id === e.from);
          const toNode = NODES.find((n) => n.id === e.to);
          if (!fromNode || !toNode) return null;
          return <Arrow key={i} from={fromNode} to={toNode} label={e.label}/>;
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const status = statusMap[node.id] || "UNKNOWN";
          const c = nodeColor(status);
          const isCore = node.id === "transaction-service";
          const r = isCore ? 44 : 34;
          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              {status === "UP" && (
                <circle r={r + 8} fill="none" stroke={c.stroke} strokeWidth={0.5} opacity={0.3}>
                  <animate attributeName="r" values={`${r+4};${r+12};${r+4}`} dur="3s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle r={r} fill={c.fill} stroke={c.stroke} strokeWidth={isCore ? 2 : 1.5} filter="url(#glow)"/>
              <circle r={5} cx={r - 8} cy={-(r - 8)} fill={c.dot}>
                {status === "UP" && (
                  <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
                )}
              </circle>
              <text y={4} textAnchor="middle" fontSize={isCore ? 11 : 9} fontWeight={600}
                fill="white" fontFamily="Inter,sans-serif">
                {node.label}
              </text>
              <text y={16} textAnchor="middle" fontSize={8} fill={c.dot} fontFamily="Inter,sans-serif">
                {status}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
