/**
 * Catégories "confetti" — source de vérité partagée front/back.
 * Chaque catégorie = couleur vive + fond pastel + émoji repère.
 * (La couleur ne porte jamais seule l'info : toujours doublée émoji + label.)
 */
export interface Category {
  id: string;
  label: string;
  emoji: string;
  color: string; // couleur vive
  colorSoft: string; // pastel (tags)
}

export const CATEGORIES: readonly Category[] = [
  { id: "eco", label: "Écologie", emoji: "🌱", color: "#19C37D", colorSoft: "#E4F8EF" },
  { id: "culture", label: "Culture", emoji: "🎭", color: "#EC2D8A", colorSoft: "#FCE3F0" },
  { id: "sport", label: "Sport", emoji: "⚽", color: "#FFB020", colorSoft: "#FFF3DA" },
  { id: "social", label: "Social", emoji: "🤝", color: "#3B6BFF", colorSoft: "#E5ECFF" },
  { id: "jeunesse", label: "Jeunesse", emoji: "🎓", color: "#8B5CF6", colorSoft: "#EFE9FE" },
  { id: "sante", label: "Santé", emoji: "❤️", color: "#FF6B57", colorSoft: "#FFE9E5" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);
