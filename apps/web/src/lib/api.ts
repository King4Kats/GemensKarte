import type { Association, Paginated, QuarantineAssoc, Suggestion } from "@gemenskarte/shared";

export type { Association, QuarantineAssoc, Suggestion };

const BASE = "/api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface ListParams {
  q?: string;
  category?: string;
  categories?: string[];
  department?: string;
  located?: boolean;
  near?: [number, number]; // [lng, lat]
  bbox?: [number, number, number, number];
  sort?: "name" | "quality";
  page?: number;
  limit?: number;
}

function buildQuery(p: ListParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.category) sp.set("category", p.category);
  if (p.categories?.length) sp.set("categories", p.categories.join(","));
  if (p.department) sp.set("department", p.department);
  if (p.located) sp.set("located", "true");
  if (p.near) sp.set("near", p.near.join(","));
  if (p.bbox) sp.set("bbox", p.bbox.join(","));
  if (p.sort) sp.set("sort", p.sort);
  if (p.page) sp.set("page", String(p.page));
  if (p.limit) sp.set("limit", String(p.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface GeoPoint {
  id: string;
  name: string;
  categoryId: string;
  city: string | null;
  lng: number;
  lat: number;
}

interface GeoFeatureCollection {
  features: Array<{
    geometry: { coordinates: [number, number] };
    properties: { id: string; name: string; categoryId: string; city: string | null };
  }>;
}

export const api = {
  list: (p: ListParams = {}) => getJSON<Paginated<Association>>(`/associations${buildQuery(p)}`),
  get: (id: string) => getJSON<Association>(`/associations/${id}`),
  geojson: async (p: ListParams = {}): Promise<GeoPoint[]> => {
    const fc = await getJSON<GeoFeatureCollection>(`/associations/geojson${buildQuery(p)}`);
    return fc.features.map((f) => ({
      ...f.properties,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  },
  fetchStats: () => getJSON<Record<string, unknown>>(`/stats`),
  recenser: (data: object): Promise<void> =>
    fetch(`${BASE}/contact/recenser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => { if (!r.ok) throw new Error("recenser failed"); }),
  deferencer: (data: object): Promise<void> =>
    fetch(`${BASE}/contact/deferencer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => { if (!r.ok) throw new Error("deferencer failed"); }),
  patchCategory: (id: string, categoryId: string): Promise<void> =>
    fetch(`${BASE}/associations/${id}/category`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    }).then((r) => { if (!r.ok) throw new Error("patch failed"); }),
  listQuarantine: (page = 1, limit = 50) =>
    getJSON<Paginated<QuarantineAssoc>>(`/associations/quarantine?page=${page}&limit=${limit}`),
  resolveQuarantine: (id: string, platform: string, action: "keep" | "drop"): Promise<void> =>
    fetch(`${BASE}/associations/${id}/quarantine`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, action }),
    }).then((r) => { if (!r.ok) throw new Error("resolve failed"); }),
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
