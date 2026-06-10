/**
 * ConfettiField : petit décor animé (des confettis qui flottent) affiché en
 * arrière-plan de la page d'accueil. Les confettis bougent légèrement en
 * fonction de la position de la souris (effet de profondeur "parallaxe").
 * Purement décoratif : ne fait rien d'utile pour les données de l'app.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

// Palette de couleurs piochée au hasard pour chaque confetti.
const COLS = ["#00d68f", "#ff2d78", "#ffc300", "#2b59ff", "#ff5c35", "#7b3ff2"];

// Décrit un confetti : sa position, sa taille, sa couleur, sa forme, etc.
interface Particle {
  id: number;
  left: number;  // %
  top: number;   // %
  size: number;
  color: string;
  rot: number;
  kind: "dot" | "rect" | "ring" | "diamond";
  delay: number;
  dur: number;
  drift: number;
  depth: number; // parallax factor 0.2–1.0
}

/**
 * Générateur de nombres "au hasard" mais reproductible : avec la même graine
 * (seed), on obtient toujours la même suite de nombres. Pratique pour que les
 * confettis soient placés pareil à chaque rendu (et pas qui sautillent).
 */
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Champ de confettis flottants avec parallaxe souris (décor de la landing). */
export function ConfettiField({ count = 28, seed = 11 }: { count?: number; seed?: number }) {
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: 0.5, y: 0.5 });
  const currentRef = useRef({ x: 0.5, y: 0.5 });

  // On écoute la souris et on fait suivre les confettis EN DOUCEUR (on glisse
  // petit à petit vers la position cible au lieu de sauter d'un coup).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      targetRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener("mousemove", onMove);

    // Boucle d'animation (rejouée ~60 fois/seconde) : à chaque image on
    // rapproche un peu la position actuelle de la cible (le "0.06" = vitesse).
    const tick = () => {
      const cur = currentRef.current;
      const tar = targetRef.current;
      const nx = cur.x + (tar.x - cur.x) * 0.06;
      const ny = cur.y + (tar.y - cur.y) * 0.06;
      if (Math.abs(nx - cur.x) > 0.0001 || Math.abs(ny - cur.y) > 0.0001) {
        currentRef.current = { x: nx, y: ny };
        setMouse({ x: nx, y: ny });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // On fabrique la liste des confettis UNE SEULE FOIS (useMemo = on mémorise le
  // résultat et on ne recalcule que si count/seed change).
  const particles = useMemo<Particle[]>(() => {
    const rnd = seededRng(seed);
    return Array.from({ length: count }).map((_, i) => {
      const shape = rnd();
      return {
        id: i,
        left: rnd() * 100,
        top: rnd() * 100,
        size: 7 + rnd() * 14,
        color: COLS[Math.floor(rnd() * COLS.length)],
        rot: rnd() * 360,
        kind: (shape < 0.38 ? "dot" : shape < 0.62 ? "rect" : shape < 0.82 ? "ring" : "diamond") as Particle["kind"],
        delay: rnd() * 7,
        dur: 7 + rnd() * 7,
        drift: 10 + rnd() * 18,
        depth: 0.2 + rnd() * 0.8,
      };
    });
  }, [count, seed]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {particles.map((p) => {
        // Décalage du confetti selon la souris : plus son "depth" est grand,
        // plus il bouge (impression que certains sont plus proches que d'autres).
        const px = (mouse.x - 0.5) * p.depth * -36;
        const py = (mouse.y - 0.5) * p.depth * -24;

        const base: CSSProperties = {
          position: "absolute",
          left: `${p.left}%`,
          top: `${p.top}%`,
          width: p.kind === "rect" ? p.size * 1.6 : p.size,
          height: p.kind === "rect" ? p.size * 0.55 : p.size,
          opacity: 0,
          animation: `cmFloat ${p.dur}s ease-in-out ${p.delay}s infinite, cmFadeIn .6s ease ${p.delay * 0.3}s forwards`,
          // CSS vars pour le keyframe
          ["--drift" as string]: `${p.drift}px`,
          ["--r" as string]: `${p.rot}deg`,
          // parallax via will-change + translate (séparé de l'animation)
          translate: `${px}px ${py}px`,
          willChange: "translate, opacity, transform",
          transition: "translate 0.1s linear",
        };

        // Selon la forme tirée au sort, on affiche un rond, un rectangle, un
        // anneau ou un losange. Le rendu visuel change mais la logique est la même.
        if (p.kind === "dot") {
          return (
            <i
              key={p.id}
              style={{
                ...base,
                borderRadius: "50%",
                background: p.color,
                boxShadow: `0 0 0 4px color-mix(in srgb, ${p.color} 14%, transparent)`,
              }}
            />
          );
        }
        if (p.kind === "rect") {
          return (
            <i
              key={p.id}
              style={{
                ...base,
                borderRadius: 3,
                background: p.color,
                opacity: 0,
              }}
            />
          );
        }
        if (p.kind === "ring") {
          return (
            <i
              key={p.id}
              style={{
                ...base,
                borderRadius: "50%",
                background: "transparent",
                border: `2.5px solid ${p.color}`,
              }}
            />
          );
        }
        // diamond
        return (
          <i
            key={p.id}
            style={{
              ...base,
              width: p.size * 0.8,
              height: p.size * 0.8,
              background: p.color,
              borderRadius: 2,
              transform: `rotate(45deg)`,
              opacity: 0,
            }}
          />
        );
      })}
    </div>
  );
}
