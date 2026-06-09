import type { CSSProperties } from "react";
import { catById } from "../lib/categories";

export function CatBadge({ cat, solid = false }: { cat: string; solid?: boolean }) {
  const c = catById(cat);
  const cls = ["badge"];
  if (solid) cls.push("badge-solid");
  if (solid && c.onLight) cls.push("on-light");
  return (
    <span className={cls.join(" ")} style={{ "--cat": c.color } as CSSProperties}>
      <span className="dot" />
      {c.label}
    </span>
  );
}
