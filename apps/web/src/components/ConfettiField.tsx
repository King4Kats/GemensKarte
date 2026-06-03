import { useMemo, type CSSProperties } from "react";

/** Champ de confettis flottants (décor de la landing). */
export function ConfettiField({ count = 18, seed = 7 }: { count?: number; seed?: number }) {
  const items = useMemo(() => {
    const cols = ["#00d68f", "#ff2d78", "#ffc300", "#2b59ff", "#ff5c35", "#7b3ff2"];
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: count }).map((_, i) => {
      const shape = rnd();
      return {
        id: i,
        left: rnd() * 100,
        top: rnd() * 100,
        size: 7 + rnd() * 12,
        color: cols[Math.floor(rnd() * cols.length)],
        rot: rnd() * 360,
        kind: shape < 0.45 ? "dot" : shape < 0.78 ? "rect" : "ring",
        delay: rnd() * 6,
        dur: 6 + rnd() * 6,
        drift: 8 + rnd() * 14,
      };
    });
  }, [count, seed]);

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: "var(--confetti-density)" }}>
      {items.map((it) => {
        const base = {
          position: "absolute", left: `${it.left}%`, top: `${it.top}%`,
          width: it.size, height: it.kind === "rect" ? it.size * 0.5 : it.size,
          transform: `rotate(${it.rot}deg)`,
          animation: `cmFloat ${it.dur}s ease-in-out ${it.delay}s infinite`,
          "--drift": `${it.drift}px`,
        } as CSSProperties;
        if (it.kind === "dot") return <i key={it.id} style={{ ...base, borderRadius: "50%", background: it.color }} />;
        if (it.kind === "rect") return <i key={it.id} style={{ ...base, borderRadius: 3, background: it.color }} />;
        return <i key={it.id} style={{ ...base, borderRadius: "50%", background: "transparent", border: `2.5px solid ${it.color}` }} />;
      })}
    </div>
  );
}
