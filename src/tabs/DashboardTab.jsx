const POWERBI_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNDg5M2IwZTQtY2JmNy00ZGZlLWI1M2MtNDU2M2VmYjMyMjhjIiwidCI6IjgzOGY2MGI3LTc4NzYtNGEwZC1iM2MxLTg1Y2VlZWE1YmJhYiIsImMiOjF9";

export default function DashboardTab() {
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
