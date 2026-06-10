/**
 * CatBadge — petite "pastille" colorée qui affiche le nom d'une catégorie d'association
 * (ex : Sport, Culture, Social) avec la couleur de cette catégorie.
 * Réutilisée un peu partout : carte, fiche détaillée, écran d'admin.
 */
import type { CSSProperties } from "react";
import { catById } from "../lib/categories";

// `cat` = l'identifiant de la catégorie (ex : "sport").
// `solid` = version pleine/colorée (true) ou version légère par défaut (false).
export function CatBadge({ cat, solid = false }: { cat: string; solid?: boolean }) {
  const c = catById(cat); // récupère les infos de la catégorie (couleur, libellé)
  // On construit la liste des classes CSS selon les options demandées.
  const cls = ["badge"];
  if (solid) cls.push("badge-solid");
  if (solid && c.onLight) cls.push("on-light"); // texte foncé si la couleur est claire
  return (
    <span className={cls.join(" ")} style={{ "--cat": c.color } as CSSProperties}>
      <span className="dot" />
      {c.label}
    </span>
  );
}
