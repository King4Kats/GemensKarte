import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Schéma Drizzle (typage des requêtes simples). La colonne géographique
 * `location geometry(Point,4326)` et les index spatiaux sont gérés dans les
 * migrations SQL (src/db/migrations) et manipulés via SQL brut (fonctions PostGIS).
 */
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  colorSoft: text("color_soft").notNull(),
});

export const associations = pgTable("associations", {
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

export const schema = { categories, associations };
