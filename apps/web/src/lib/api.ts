import type { Association, Paginated, Suggestion } from "@gemenskarte/shared";

export type { Association, Suggestion };

const BASE = "/api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface ListParams {
  q?: string;
  category?: string;
  department?: string;
  located?: boolean;
  near?: [number, number]; // [lng, lat]
  bbox?: [number, number, number, number];
  page?: number;
  limit?: number;
}

function buildQuery(p: ListParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.category) sp.set("category", p.category);
  if (p.department) sp.set("department", p.department);
  if (p.located) sp.set("located", "true");
  if (p.near) sp.set("near", p.near.join(","));
  if (p.bbox) sp.set("bbox", p.bbox.join(","));
  if (p.page) sp.set("page", String(p.page));
  if (p.limit) sp.set("limit", String(p.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  list: (p: ListParams = {}) => getJSON<Paginated<Association>>(`/associations${buildQuery(p)}`),
  get: (id: string) => getJSON<Association>(`/associations/${id}`),
  suggest: (q: string, limit = 6) =>
    getJSON<Suggestion[]>(`/search/suggest?q=${encodeURIComponent(q)}&limit=${limit}`),
};

/* ---- Helpers de présentation (l'API RNA n'a pas tous les champs riches) ---- */

export function blurbOf(a: Association): string {
  if (a.blurb) return a.blurb;
  if (a.description) {
    const d = a.description.trim();
    return d.length > 140 ? `${d.slice(0, 137).trimEnd()}…` : d;
  }
  return "Association du Répertoire National des Associations.";
}

export function actionOf(a: Association): string {
  return a.action || "Contacter l'association";
}

export function websiteOf(a: Association): string | null {
  return a.social?.website ?? null;
}
