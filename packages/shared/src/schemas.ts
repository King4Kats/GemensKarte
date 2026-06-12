/**
 * Schémas de données partagés entre le front et l'API.
 *
 * On utilise Zod (une librairie qui décrit la "forme" attendue des données et
 * vérifie qu'elles sont valides). Chaque schéma sert à deux choses :
 * - valider/nettoyer les données entrantes (ex : les paramètres d'une requête) ;
 * - générer automatiquement le type TypeScript correspondant (via z.infer),
 *   pour éviter d'écrire deux fois la même structure.
 */
import { z } from "zod";
import { CATEGORY_IDS } from "./categories";

/** Régions couvertes par GemensKarte. */
export const REGIONS = ["Bretagne", "Pays de la Loire", "Normandie"] as const;

/** Statut de publication d'une fiche. */
export const AssociationStatus = z.enum(["published", "pending", "draft"]);
export type AssociationStatus = z.infer<typeof AssociationStatus>;

// Liens vers les réseaux sociaux d'une association.
// Tout est optionnel (`.partial()`) : une asso peut n'en renseigner aucun.
export const SocialLinks = z
  .object({
    website: z.string().url().optional(),
    facebook: z.string().url().optional(),
    instagram: z.string().url().optional(),
    twitter: z.string().url().optional(),
    linkedin: z.string().url().optional(),
  })
  .partial();
export type SocialLinks = z.infer<typeof SocialLinks>;

/** Représentation publique d'une association (réponse API). */
export const Association = z.object({
  id: z.string().uuid(),
  rnaId: z.string().nullable(),
  name: z.string(),
  slug: z.string().nullable(),
  categoryId: z.enum(CATEGORY_IDS),
  description: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  department: z.string().nullable(),
  region: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  social: SocialLinks,
  tags: z.array(z.string()),
  /** Métadonnées riches de fiche (présentes sur les fiches soignées, sinon null). */
  blurb: z.string().nullable().optional(),
  members: z.number().nullable().optional(),
  founded: z.number().nullable().optional(),
  needs: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  status: AssociationStatus,
  source: z.enum(["manual", "rna"]),
  /** Score qualité/fraîcheur calculé par le pipeline (0-100 + tier + flags). */
  qualityScore: z.object({
    score: z.number(),
    tier: z.enum(["A", "B", "C", "D"]),
    flags: z.array(z.string()).optional(),
  }).nullable().optional(),
  /** Agenda à venir (événements OpenAgenda rattachés par proximité). */
  events: z.array(z.object({
    title: z.string().nullable().optional(),
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional(),
    dateLabel: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    place: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    matchedAsso: z.boolean().optional(),
    distKm: z.number().optional(),
  })).optional(),
  /** Distance en mètres depuis le point `near`, si fourni dans la requête. */
  distanceM: z.number().nullable().optional(),
  /** Localisation approximative (posée au centre de la commune, faute d'adresse précise). */
  geoApprox: z.boolean().optional(),
});
export type Association = z.infer<typeof Association>;

/* ----------------------------- Requêtes ----------------------------- */

// Dans une URL, tout arrive sous forme de texte ("20", pas le nombre 20).
// `z.coerce.number()` convertit ce texte en vrai nombre automatiquement.
const numeric = z.coerce.number();

/** bbox = "minLng,minLat,maxLng,maxLat" (zone visible de la carte). */
// On reçoit une chaîne "x,y,x,y", on la découpe, on vérifie qu'il y a bien
// 4 nombres valides, puis on la transforme en objet pratique à utiliser.
export const BBoxSchema = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .refine((a) => a.length === 4 && a.every((n) => Number.isFinite(n)), {
    message: "bbox attendu : minLng,minLat,maxLng,maxLat",
  })
  .transform(([minLng, minLat, maxLng, maxLat]) => ({ minLng, minLat, maxLng, maxLat }));

/** near = "lng,lat" (centre pour le tri par distance). */
export const NearSchema = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .refine((a) => a.length === 2 && a.every((n) => Number.isFinite(n)), {
    message: "near attendu : lng,lat",
  })
  .transform(([lng, lat]) => ({ lng, lat }));

/** Coerce "true"/"1" → true, sinon undefined (compatible query string). */
const boolish = z.preprocess(
  (v) => (v === undefined ? undefined : v === "true" || v === "1" || v === true),
  z.boolean().optional(),
);

// Tous les filtres possibles de la liste d'associations, tels qu'ils arrivent
// dans l'URL (ex : /api/associations?q=judo&category=sport&page=2).
export const ListAssociationsQuery = z.object({
  q: z.string().trim().min(1).optional(), // texte recherché
  category: z.enum(CATEGORY_IDS).optional(),
  categories: z
    .string()
    .transform((s) =>
      s.split(',').filter((id): id is typeof CATEGORY_IDS[number] =>
        (CATEGORY_IDS as readonly string[]).includes(id),
      ),
    )
    .optional(),
  department: z.string().regex(/^\d{2,3}$/).optional(),
  bbox: BBoxSchema.optional(),
  near: NearSchema.optional(),
  /** Ne renvoyer que les associations géolocalisées (pour la carte). */
  located: boolish,
  /** Tri : par nom (défaut) ou par score qualité décroissant. */
  sort: z.enum(["name", "quality"]).optional(),
  page: numeric.int().min(1).default(1),
  limit: numeric.int().min(1).max(100).default(20),
});
export type ListAssociationsQuery = z.infer<typeof ListAssociationsQuery>;

export const SuggestQuery = z.object({
  q: z.string().trim().min(1),
  limit: numeric.int().min(1).max(20).default(8),
  department: z.string().regex(/^\d{2,3}$/).optional(),
});
export type SuggestQuery = z.infer<typeof SuggestQuery>;

// Recherche "filtre carte" : renvoie tous les ids d'assos qui matchent un mot-clé
// (nom OU descriptif), pour masquer les points non concernés sur la carte.
export const MatchQuery = z.object({
  q: z.string().trim().min(1),
  department: z.string().regex(/^\d{2,3}$/).optional(),
});
export type MatchQuery = z.infer<typeof MatchQuery>;

/** Payload de référencement public d'une association. */
export const CreateAssociationInput = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.enum(CATEGORY_IDS),
  description: z.string().max(2000).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  postalCode: z.string().regex(/^\d{5}$/).optional(),
  city: z.string().max(120).optional(),
  social: SocialLinks.optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
});
export type CreateAssociationInput = z.infer<typeof CreateAssociationInput>;

/* ----------------------------- Réponses ----------------------------- */

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

/** Élément léger renvoyé par l'autocomplétion. */
export const Suggestion = z.object({
  id: z.string().uuid(),
  name: z.string(),
  categoryId: z.enum(CATEGORY_IDS),
  city: z.string().nullable(),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const PatchCategoryInput = z.object({
  categoryId: z.enum(CATEGORY_IDS),
});
export type PatchCategoryInput = z.infer<typeof PatchCategoryInput>;

/* ------------------------ Revue de quarantaine ------------------------ */

/** Une fiche avec au moins un lien en quarantaine (en attente d'arbitrage humain). */
export interface QuarantineAssoc {
  id: string;
  name: string;
  city: string | null;
  department: string | null;
  description: string | null;
  /** Liens déjà appliqués (contexte). */
  social: Record<string, string>;
  /** platform -> { url, score, reason } à arbitrer. */
  quarantine: Record<string, { url: string; score: number; reason: string }>;
}

/** Arbitrage d'un lien en quarantaine : le garder (→ social) ou le jeter (→ meta.dropped). */
export const ResolveQuarantineInput = z.object({
  platform: z.string().min(1).max(40),
  action: z.enum(["keep", "drop"]),
});
export type ResolveQuarantineInput = z.infer<typeof ResolveQuarantineInput>;
