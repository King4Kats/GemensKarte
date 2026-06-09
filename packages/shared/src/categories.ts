/**
 * Catégories "confetti" — source de vérité partagée front/back.
 * Palette issue de la direction artistique GemensKarte (Claude Design) :
 * fond blanc, couleurs vives réservées aux badges/boutons/pins.
 * `onLight` = le texte du badge plein doit être sombre (couleur claire).
 */
export interface Category {
  id: string;
  label: string;
  emoji: string;
  color: string; // couleur vive (hex)
  colorSoft: string; // pastel (tags / fonds)
  onLight: boolean; // true → badge plein avec texte sombre
}

export const CATEGORIES: readonly Category[] = [
  { id: "eco",    label: "Écologie",   emoji: "🌱", color: "#00d68f", colorSoft: "#E3FAF2", onLight: true },
  { id: "cult",   label: "Culture",    emoji: "🎭", color: "#ff2d78", colorSoft: "#FFE6EF", onLight: false },
  { id: "sport",  label: "Sport",      emoji: "⚽", color: "#ffc300", colorSoft: "#FFF6D9", onLight: true },
  { id: "social", label: "Vie locale", emoji: "🤝", color: "#2b59ff", colorSoft: "#E6ECFF", onLight: false },
  { id: "soli",   label: "Solidarité", emoji: "🧡", color: "#ff5c35", colorSoft: "#FFE9E2", onLight: false },
  { id: "edu",    label: "Éducation",  emoji: "🎓", color: "#7b3ff2", colorSoft: "#EFE7FD", onLight: false },
  { id: "patri",  label: "Patrimoine", emoji: "🏛️", color: "#B07A1C", colorSoft: "#FAF3E0", onLight: true },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);
