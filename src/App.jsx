import { useMemo, useState } from "react";

const BUILD_TIMESTAMP = "2026-03-30 00:50 ET";

/**
 * Slap Shot — Going Yard UI shell (header + tabs + dark neon theme)
 * Embedded Power BI report in the "Dashboard" tab.
 *
 * Style + layout conventions mirror the attached Going Yard App_2 shell:
 * - Oswald + DM Mono
 * - sticky header
 * - tabs bar
 * - dark surface + accent highlights
 */
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#080c10;--surface:#0d1318;--surface2:#131b22;--border:#1e2d3a;
  --accent:#e8411a;--accent2:#f5a623;--ice:#38b8f2;--green:#27c97a;
  --text:#e8edf2;--muted:#5a7080;
}
body{background:var(--bg);color:var(--text);font-family:'Oswald',sans-serif;min-height:100vh;}
.app{min-height:100vh;display:flex;flex-direction:column;}

.header{
  padding:16px 24px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  background:linear-gradient(180deg,#0a1520 0%,var(--bg) 100%);
  position:sticky;top:0;z-index:100;backdrop-filter:blur(12px);
}

.logo{
  font-family:'Oswald',sans-serif;font-weight:700;font-size:26px;
  text-transform:uppercase;letter-spacing:3px;color:var(--text);
  display:flex;align-items:center;gap:10px;
}
.logo span{color:var(--accent);}
.logo-dot{
  width:9px;height:9px;background:var(--accent);border-radius:50%;
  animation:pulse 1.8s ease-in-out infinite;
}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}

.badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.badge{
  display:flex;align-items:center;gap:6px;
  padding:4px 11px;border-radius:20px;font-size:11px;font-weight:600;
  letter-spacing:1.2px;text-transform:uppercase;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
  color:var(--muted);
}
.badge.live{background:rgba(39,201,122,.10);border:1px solid rgba(39,201,122,.25);color:var(--green);}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px rgba(39,201,122,.55);}

.tabs{
  display:flex;padding:0 16px;background:var(--surface);
  border-bottom:1px solid var(--border);overflow-x:auto;
}
.tab{
  padding:12px 14px;font-size:10px;font-weight:600;letter-spacing:1.5px;
  text-transform:uppercase;cursor:pointer;border:none;background:none;
  color:var(--muted);border-bottom:2px solid transparent;transition:all .2s;
  font-family:'Oswald',sans-serif;white-space:nowrap;
}
.tab:hover{color:var(--text);}
.tab.active{color:var(--text);border-bottom-color:var(--accent);}

.content{flex:1;padding:22px;max-width:1440px;margin:0 auto;width:100%;}
.section-header{margin-bottom:16px;}
.section-title{
  font-family:'Oswald',sans-serif;font-weight:700;font-size:26px;
  text-transform:uppercase;letter-spacing:2px;color:var(--text);
}
.section-sub{
  font-size:12px;color:var(--muted);margin-top:3px;
  font-family:'Oswald',sans-serif;font-weight:300;letter-spacing:.5px;
}

.card{
  background:var(--surface);border:1px solid var(--border);
  border-radius:10px;padding:14px 16px;margin-bottom:14px;
}
.mono{font-family:'DM Mono',monospace;}
.note{
  background:rgba(56,184,242,.06);border:1px solid rgba(56,184,242,.15);
  border-radius:8px;padding:10px 14px;color:rgba(56,184,242,.85);
  font-size:11px;line-height:1.6;font-family:'DM Mono',monospace;margin-bottom:14px;
}
.btn{
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 12px;border-radius:7px;border:1px solid var(--border);
  background:var(--surface2);color:var(--muted);cursor:pointer;
  font-size:11px;font-family:'DM Mono',monospace;text-decoration:none;
  transition:all .15s;
}
.btn:hover{border-color:var(--accent);color:var(--accent);}

.embed{
  border-radius:12px;overflow:hidden;border:1px solid var(--border);
  background:var(--surface);position:relative;
  padding-bottom:56.25%; /* 16:9 */
  height:0;
}
.embed iframe{
  position:absolute;inset:0;width:100%;height:100%;border:none;
}

.footer{
  text-align:center;padding:12px 0 10px;border-top:1px solid var(--border);
  margin-top:22px;
}
.footer span{
  font-size:10px;color:#2a3a48;font-family:'DM Mono',monospace;letter-spacing:1px;
}

@media(max-width:768px){
  .content{padding:13px;}
  .header{padding:12px 15px;}
  .section-title{font-size:22px;}
}
`;

const POWERBI_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNDg5M2IwZTQtY2JmNy00ZGZlLWI1M2MtNDU2M2VmYjMyMjhjIiwidCI6IjgzOGY2MGI3LTc4NzYtNGEwZC1iM2MxLTg1Y2VlZWE1YmJhYiIsImMiOjF9";

function DashboardTab() {
  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏒 Slap Shot</div>
        <div className="section-sub">Power BI dashboard embedded inside the Slap Shot shell</div>
      </div>

      <div className="note">
        ℹ️ If the report asks you to sign in, that’s normal for some Power BI embed modes.
        Embedded reports still enforce permissions and may prompt authentication depending on your session.{" "}
        <span className="mono">(Pop-up blockers can interfere with sign-in flows.)</span>
      </div>

      <div className="embed">
        <iframe
          title="Slap Shot — Power BI"
          src={POWERBI_URL}
          allowFullScreen
        />
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <a className="btn" href={POWERBI_URL} target="_blank" rel="noopener noreferrer">
          ↗ Open in Power BI
        </a>
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div>
      <div className="section-header">
        <div className="section-title">📌 About</div>
        <div className="section-sub">Lightweight shell + embedded analytics</div>
      </div>

      <div className="card">
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.8 }}>
          <div><span style={{ color: "var(--text)" }}>App:</span> Slap Shot</div>
          <div><span style={{ color: "var(--text)" }}>Domain:</span> shot.prsmlabs.app</div>
          <div><span style={{ color: "var(--text)" }}>Build:</span> {BUILD_TIMESTAMP}</div>
        </div>
      </div>

      <div className="card">
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.8 }}>
          Next easy upgrades:
          <ul style={{ marginTop: 8, marginLeft: 18 }}>
            <li>Add more tabs (Scoreboard / Players / Clips)</li>
            <li>Add a “full bleed” dashboard mode toggle</li>
            <li>Replace iframe with <span style={{ color: "var(--text)" }}>powerbi-client-react</span> for deeper control</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");

  const tabs = useMemo(
    () => [
      { key: "dashboard", label: "📊 Dashboard", accent: true },
      { key: "about", label: "📌 About" },
    ],
    []
  );

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="logo">
            <div className="logo-dot" />
            🏒 <span>SLAP</span> SHOT
          </div>
          <div className="badges">
            <div className="badge live">
              <div className="badge-dot" />
              LIVE
            </div>
            <div className="badge">PRSM LABS</div>
          </div>
        </header>

        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
              style={t.accent && tab === t.key ? { color: "var(--accent)" } : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="content">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "about" && <AboutTab />}
        </main>

        <div className="footer">
          <span>Slap Shot · Build {BUILD_TIMESTAMP} · prsm-labs</span>
        </div>
      </div>
    </>
  );
}