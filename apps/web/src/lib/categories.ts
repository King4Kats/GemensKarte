/**
 * Liste des catégories d'associations (Écologie, Culture, Sport...).
 * Chaque catégorie a sa couleur et son emoji, utilisés pour colorer les
 * points sur la carte et les pastilles/filtres. Cette liste doit rester
 * identique à celle du backend (le serveur), d'où l'import partagé.
 */
import type { Category } from "@gemenskarte/shared";

/** Catégories "confetti" — alignées sur le backend (@gemenskarte/shared). */
export const CATEGORIES: Category[] = [
  { id: "eco",    label: "Écologie",   emoji: "🌱", color: "#00d68f", colorSoft: "#E3FAF2", onLight: true },
  { id: "cult",   label: "Culture",    emoji: "🎭", color: "#ff2d78", colorSoft: "#FFE6EF", onLight: false },
  { id: "sport",  label: "Sport",      emoji: "⚽", color: "#ffc300", colorSoft: "#FFF6D9", onLight: true },
  { id: "social", label: "Social",     emoji: "🤝", color: "#2b59ff", colorSoft: "#E6ECFF", onLight: false },
  { id: "soli",   label: "Solidarité", emoji: "🧡", color: "#ff5c35", colorSoft: "#FFE9E2", onLight: false },
  { id: "edu",    label: "Éducation",  emoji: "🎓", color: "#7b3ff2", colorSoft: "#EFE7FD", onLight: false },
  { id: "patri",  label: "Patrimoine", emoji: "🏛️", color: "#9c6e3c", colorSoft: "#F5EDE0", onLight: false },
];

// Petit "annuaire" : on transforme la liste en table id -> catégorie
// pour retrouver une catégorie instantanément sans parcourir tout le tableau.
const BY_ID: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/**
 * Retrouve une catégorie à partir de son identifiant.
 * Si l'id est manquant ou inconnu, on renvoie la première catégorie
 * par défaut (jamais de "trou" : on a toujours une catégorie valide).
 */
export function catById(id: string | null | undefined): Category {
  return (id && BY_ID[id]) || CATEGORIES[0];
}
