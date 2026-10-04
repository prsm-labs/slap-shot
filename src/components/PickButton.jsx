import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PICK_TYPE, PICK_TYPES, removePick, setPick, usePicks } from "../lib/picks.js";

// The [+] pick button. The menu is rendered into document.body and positioned from the button's
// on-screen rectangle, so it isn't clipped or shifted by a parent using CSS transforms (the Top 3
// flip cards) or overflow (scrolling tables). It opens below the button, or above when there's no room.
const MENU_W = 170;

export default function PickButton({ player, size = "sm" }) {
  const picks = usePicks();
  const current = picks[player.playerId];
  const type = current ? PICK_TYPE[current.type] : null;
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  function toggle() {
    if (open) return setOpen(false);
    const r = btnRef.current.getBoundingClientRect();
    const menuH = (PICK_TYPES.length + (current ? 1 : 0)) * 30 + 10;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - MENU_W - 8);
    const below = r.bottom + 4 + menuH <= window.innerHeight;
    setPos({ left, top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - menuH) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const choose = (key) => {
    setPick(player.playerId, player.name, player.team, key);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        className="mono"
        title={type ? `My pick: ${type.label}` : "Add to My Picks"}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        style={{
          fontSize: size === "lg" ? 12 : 10, padding: size === "lg" ? "3px 9px" : "1px 6px", borderRadius: 10, cursor: "pointer",
          border: `1px solid ${type ? "var(--accent2)" : "var(--border)"}`, background: type ? "rgba(74,159,212,.18)" : "transparent",
          color: type ? "var(--text)" : "var(--muted)", whiteSpace: "nowrap", lineHeight: 1.4,
        }}
      >
        {type ? `${type.emoji} ${type.label}` : "＋"}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: pos.left, top: pos.top, width: MENU_W, zIndex: 2000, padding: 5,
            background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.5)",
          }}
        >
          {PICK_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => choose(t.key)}
              className="mono"
              style={{
                display: "block", width: "100%", textAlign: "left", height: 30, padding: "0 8px", fontSize: 12, cursor: "pointer",
                background: current?.type === t.key ? "rgba(74,159,212,.22)" : "transparent", border: "none", borderRadius: 5, color: "var(--text)",
              }}
            >
              {t.emoji} {t.label}{current?.type === t.key ? " ✓" : ""}
            </button>
          ))}
          {current && (
            <button
              onClick={() => { removePick(player.playerId); setOpen(false); }}
              className="mono"
              style={{ display: "block", width: "100%", textAlign: "left", height: 30, padding: "0 8px", fontSize: 12, cursor: "pointer", background: "transparent", border: "none", color: "var(--red)" }}
            >
              ✕ Remove
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
