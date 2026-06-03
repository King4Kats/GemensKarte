import { z } from "zod";
import { CATEGORY_IDS } from "./categories";

/** Régions couvertes par GemensKarte. */
export const REGIONS = ["Bretagne", "Pays de la Loire", "Normandie"] as const;

/** Statut de publication d'une fiche. */
export const AssociationStatus = z.enum(["published", "pending", "draft"]);
export type AssociationStatus = z.infer<typeof AssociationStatus>;

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
  /** Distance en mètres depuis le point `near`, si fourni dans la requête. */
  distanceM: z.number().nullable().optional(),
});
export type Association = z.infer<typeof Association>;

/* ----------------------------- Requêtes ----------------------------- */

const numeric = z.coerce.number();

/** bbox = "minLng,minLat,maxLng,maxLat" (zone visible de la carte). */
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

export const ListAssociationsQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  department: z.string().regex(/^\d{2,3}$/).optional(),
  bbox: BBoxSchema.optional(),
  near: NearSchema.optional(),
  /** Ne renvoyer que les associations géolocalisées (pour la carte). */
  located: boolish,
  page: numeric.int().min(1).default(1),
  limit: numeric.int().min(1).max(100).default(20),
});
export type ListAssociationsQuery = z.infer<typeof ListAssociationsQuery>;

export const SuggestQuery = z.object({
  q: z.string().trim().min(1),
  limit: numeric.int().min(1).max(20).default(8),
});
export type SuggestQuery = z.infer<typeof SuggestQuery>;

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
