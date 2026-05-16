import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Ana Ekran", end: true },
  { to: "/scenarios", label: "Senaryolar", end: false },
  { to: "/reports", label: "Raporlar", end: false },
  { to: "/ai-suggests", label: "Yapay Zeka", end: false },
];

export default function Layout({ children }) {
  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", gap: 16,
        padding: "0 28px", height: 80,
        background: "rgba(1,2,5,0.88)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(240,192,64,0.1)",
        boxShadow: "0 1px 30px rgba(0,0,0,0.6)",
      }}>
        {/* Logo + Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 8 }}>
          <div style={{
            width: 63, height: 63, borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(240,192,64,0.06)",
            border: "1px solid rgba(240,192,64,0.2)",
            boxShadow: "0 0 20px rgba(240,192,64,0.15)",
          }}>
            <img
              src="/logo3.png"
              alt="Chaos GOAT"
              onError={(e) => { e.target.src = "/logo3.png"; }}
              style={{ width: 58, height: 58, objectFit: "contain" }}
            />
          </div>
          <span style={{
            fontWeight: 800, fontSize: 13, letterSpacing: 2.5,
            background: "linear-gradient(135deg, #f0c040 0%, #ffd97d 60%, #e6a800 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            CHAOS GOAT
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }}/>

        {/* Nav Items */}
        <div style={{ display: "flex", gap: 4, flex: 1 }}>
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                padding: "7px 18px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                textDecoration: "none",
                color: isActive ? "#f0c040" : "rgba(255,255,255,0.5)",
                background: isActive
                  ? "linear-gradient(135deg, rgba(240,192,64,0.18), rgba(240,192,64,0.06))"
                  : "transparent",
                border: isActive ? "1px solid rgba(240,192,64,0.25)" : "1px solid transparent",
                boxShadow: isActive ? "0 0 16px rgba(240,192,64,0.12), inset 0 0 12px rgba(240,192,64,0.05)" : "none",
                letterSpacing: isActive ? 0.3 : 0,
                transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.classList.contains("active")) {
                  e.currentTarget.style.color = "rgba(255,255,255,0.85)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.classList.contains("active")) {
                  e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {label}
            </NavLink>
          ))}
        </div>

        {/* Right status dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3a0", boxShadow: "0 0 6px #22d3a0" }}/>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>CANLI</span>
        </div>
      </nav>

      <main style={{ paddingTop: 92, minHeight: "100vh" }}>
        {children}
      </main>
    </div>
  );
}
