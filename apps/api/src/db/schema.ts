/**
 * SCHÉMA de la base de données décrit en TypeScript avec Drizzle (un "ORM" :
 * outil qui fait le lien entre le code et les tables SQL). Ce fichier sert de
 * "carte" des tables : il donne le nom des colonnes et leur type, ce qui permet
 * d'écrire des requêtes typées (l'éditeur prévient si on se trompe de champ).
 *
 * À savoir : la colonne géographique `location geometry(Point,4326)` (la position
 * sur la carte) et les index spatiaux ne sont PAS ici ; ils sont créés dans les
 * migrations SQL et utilisés via du SQL brut (fonctions PostGIS = extension carto).
 */
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Table des catégories d'associations (ex : "eco", "sport", "culture").
// Chaque catégorie porte un libellé, un emoji et des couleurs pour l'affichage.
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  colorSoft: text("color_soft").notNull(),
});

// Table principale : les associations affichées sur la carte.
// On y trouve les infos publiques (nom, contact, adresse) plus deux colonnes
// `jsonb` (= du JSON stocké en base, format souple) pour des données variables :
// `social` (réseaux sociaux) et `meta` (infos libres comme l'année de création).
export const associations = pgTable("associations", {
  // id généré automatiquement (uuid = identifiant unique aléatoire).
  id: uuid("id").primaryKey().defaultRandom(),
  rnaId: text("rna_id"),
  name: text("name").notNull(),
  slug: text("slug"),
  categoryId: text("category_id"),
  description: text("description"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  department: text("department"),
  region: text("region"),
  social: jsonb("social").default({}),
  meta: jsonb("meta").default({}),
  tags: text("tags").array(),
  status: text("status").notNull().default("published"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Regroupe les tables dans un seul objet, pratique à passer à Drizzle.
export const schema = { categories, associations };
