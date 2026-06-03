import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Suggestion } from "../lib/api";
import { catById } from "../lib/categories";
import { Icon } from "./Icon";

interface Props {
  size?: "lg" | "sm";
  autoFocus?: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  suggestions?: Suggestion[];
  onPick: (s: Suggestion) => void;
}

export function SearchBar({ size = "lg", autoFocus = false, value, onChange, onSubmit, suggestions = [], onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showSug = open && !!value && suggestions.length > 0;
  const big = size === "lg";

  const onKey = (e: KeyboardEvent) => {
    if (!showSug) { if (e.key === "Enter") onSubmit?.(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (hi >= 0 && suggestions[hi]) onPick(suggestions[hi]);
      else onSubmit?.();
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: big ? 14 : 10,
          background: "var(--bg)",
          height: big ? 68 : 50,
          padding: big ? "0 8px 0 22px" : "0 6px 0 16px",
          borderRadius: "var(--radius-pill)",
          boxShadow: open
            ? "0 0 0 2px var(--accent), 0 18px 50px rgba(20,20,27,.14)"
            : "0 0 0 1.5px var(--hairline), 0 10px 34px rgba(20,20,27,.07)",
          transition: "box-shadow .2s",
        }}
      >
        <span style={{ color: open ? "var(--accent)" : "var(--muted)", display: "flex", transition: "color .2s" }}>
          <Icon name="search" size={big ? 24 : 19} stroke={2.4} />
        </span>
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={big ? "Que cherchez-vous ?  Où ?" : "Rechercher une asso, une ville…"}
          style={{
            flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent",
            fontFamily: "var(--font)", fontWeight: 600,
            fontSize: big ? 19 : 15, color: "var(--ink)", letterSpacing: "-0.01em",
          }}
        />
        <button className={big ? "btn btn-accent btn-md" : "btn btn-accent btn-sm"} style={{ flexShrink: 0 }} onClick={() => onSubmit?.()}>
          {big ? "Explorer" : "Go"}
          {big && <Icon name="arrow" size={16} stroke={2.6} />}
        </button>
      </div>

      {showSug && (
        <div
          className="cm-scroll"
          style={{
            position: "absolute", top: "calc(100% + 10px)", left: 0, right: 0, zIndex: 40,
            background: "var(--bg)", borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-pop)", border: "1px solid var(--hairline)",
            padding: 8, maxHeight: 340, overflowY: "auto",
          }}
        >
          {suggestions.map((s, i) => {
            const c = catById(s.categoryId);
            return (
              <button
                key={s.id}
                onMouseEnter={() => setHi(i)}
                onClick={() => onPick(s)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  textAlign: "left", border: 0, cursor: "pointer",
                  background: hi === i ? "var(--bg-sunk)" : "transparent",
                  borderRadius: 12, padding: "10px 12px", transition: "background .12s",
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: c.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${c.color} 18%, transparent)`,
                }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, color: "var(--ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
                    {c.label}{s.city ? ` · ${s.city}` : ""}
                  </span>
                </span>
                <span style={{ color: "var(--muted)", display: "flex" }}>
                  <Icon name="arrowUpRight" size={16} stroke={2.2} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
