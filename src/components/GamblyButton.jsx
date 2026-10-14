import { useState } from "react";
import { gamblyUrl } from "../lib/gambly.js";

// [G] button: copies `text` and opens Gambly's chat with it typed in (lib/gambly.js). compact = logo only (tables).
// Never opens a slideout / row underneath (stopPropagation).
export default function GamblyButton({ text, compact = true, label = "Gambly", title }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  const go = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* clipboard blocked: the bet is still typed into Gambly */
    }
    window.open(gamblyUrl(text), "_blank", "noopener,noreferrer");
  };
  const tip = title || `Gambly: copies "${text.split("\n").join(" · ")}" and opens Gambly with it typed in`;
  return (
    <button type="button" className="pill-btn" onClick={go} title={tip}
      style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4, padding: compact ? "1px 4px" : undefined, verticalAlign: "middle", lineHeight: 1 }}>
      <img src="/brand/gambly.png" alt="Gambly" width={compact ? 12 : 14} height={compact ? 12 : 14} />
      {done ? "✓" : compact ? null : label}
    </button>
  );
}
