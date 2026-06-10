/**
 * Point d'entrée unique pour parler au serveur (l'API).
 * Toutes les requêtes HTTP du front (lister les associations, voir une fiche,
 * envoyer un formulaire de contact...) passent par l'objet `api` défini ici.
 * Centraliser ça évite de répéter des appels `fetch` un peu partout.
 */
import type { Association, Paginated, QuarantineAssoc, Suggestion } from "@gemenskarte/shared";

export type { Association, QuarantineAssoc, Suggestion };

// Préfixe commun à toutes les URLs : le front appelle "/api/..." et un proxy
// redirige vers le vrai serveur NestJS.
const BASE = "/api";

// Petit raccourci : fait un GET, vérifie que tout s'est bien passé, et renvoie
// la réponse déjà convertie en objet JS. Lève une erreur si le serveur répond
// un code d'échec (ex : 404, 500), pour qu'on puisse la gérer plus haut.
async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

// --- Jeton d'administration ---------------------------------------------------
// Les pages d'admin (revue des liens, catégories) sont protégées côté serveur.
// On stocke le jeton saisi par l'admin dans le navigateur (localStorage) et on
// l'envoie dans l'en-tête `x-admin-token` sur les appels protégés.
const ADMIN_KEY = "gk_admin_token";
export const adminAuth = {
  has: () => !!localStorage.getItem(ADMIN_KEY),
  set: (t: string) => localStorage.setItem(ADMIN_KEY, t.trim()),
  clear: () => localStorage.removeItem(ADMIN_KEY),
};
function adminHeaders(): Record<string, string> {
  const t = localStorage.getItem(ADMIN_KEY);
  return t ? { "x-admin-token": t } : {};
}

// Tous les filtres possibles pour rechercher des associations.
// Tout est optionnel : on ne met que ce dont on a besoin pour une recherche.
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

// Transforme les filtres en "query string" (la partie après le "?" dans une
// URL, ex : "?q=judo&department=44"). On n'ajoute un paramètre que s'il est
// renseigné, pour garder l'URL propre.
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

// Un point à afficher sur la carte : une association avec ses coordonnées
// (lng = longitude, lat = latitude).
export interface GeoPoint {
  id: string;
  name: string;
  categoryId: string;
  city: string | null;
  lng: number;
  lat: number;
}

// Format renvoyé par le serveur pour les données géo (standard "GeoJSON").
// On le reçoit comme ça puis on le simplifie en GeoPoint (voir plus bas).
interface GeoFeatureCollection {
  features: Array<{
    geometry: { coordinates: [number, number] };
    properties: { id: string; name: string; categoryId: string; city: string | null };
  }>;
}

// L'objet `api` : la liste de toutes les actions possibles côté serveur.
// Chaque fonction construit la bonne URL et renvoie une "promesse" (le résultat
// arrive de façon asynchrone, on l'attend avec await).
export const api = {
  // Liste paginée des associations (résultat découpé en pages).
  list: (p: ListParams = {}) => getJSON<Paginated<Association>>(`/associations${buildQuery(p)}`),
  // Détail d'une seule association à partir de son identifiant.
  get: (id: string) => getJSON<Association>(`/associations/${id}`),
  // Variante "carte" : récupère les points géo et les remet à plat en GeoPoint
  // (on extrait lng/lat des coordonnées GeoJSON pour faciliter l'affichage).
  geojson: async (p: ListParams = {}): Promise<GeoPoint[]> => {
    const fc = await getJSON<GeoFeatureCollection>(`/associations/geojson${buildQuery(p)}`);
    return fc.features.map((f) => ({
      ...f.properties,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  },
  // Chiffres globaux du site (nombre d'associations, etc.).
  fetchStats: () => getJSON<Record<string, unknown>>(`/stats`),
  // Envoie une demande pour ajouter une association (formulaire "recenser").
  // POST = on envoie des données au serveur ; on ne récupère rien en retour.
  recenser: (data: object): Promise<void> =>
    fetch(`${BASE}/contact/recenser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => { if (!r.ok) throw new Error("recenser failed"); }),
  // Envoie une demande de retrait d'une association (formulaire "déréférencer").
  deferencer: (data: object): Promise<void> =>
    fetch(`${BASE}/contact/deferencer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => { if (!r.ok) throw new Error("deferencer failed"); }),
  // Change la catégorie d'une association (action d'administration).
  // PATCH = on modifie partiellement une donnée existante.
  patchCategory: (id: string, categoryId: string): Promise<void> =>
    fetch(`${BASE}/associations/${id}/category`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ categoryId }),
    }).then((r) => { if (r.status === 401) adminAuth.clear(); if (!r.ok) throw new Error("patch failed"); }),
  // Liste les associations "en quarantaine" : données douteuses mises de côté,
  // en attente d'une vérification humaine (page d'administration, jeton requis).
  listQuarantine: async (page = 1, limit = 50): Promise<Paginated<QuarantineAssoc>> => {
    const res = await fetch(`${BASE}/associations/quarantine?page=${page}&limit=${limit}`, {
      headers: adminHeaders(),
    });
    if (res.status === 401) { adminAuth.clear(); throw new Error("admin auth"); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Paginated<QuarantineAssoc>;
  },
  // Tranche le sort d'une donnée en quarantaine : "keep" (on garde) ou
  // "drop" (on jette), pour une plateforme/source donnée.
  resolveQuarantine: (id: string, platform: string, action: "keep" | "drop"): Promise<void> =>
    fetch(`${BASE}/associations/${id}/quarantine`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ platform, action }),
    }).then((r) => { if (r.status === 401) adminAuth.clear(); if (!r.ok) throw new Error("resolve failed"); }),
  // Suggestions de recherche en temps réel (l'autocomplétion quand on tape).
  // Géré par Meilisearch côté serveur. encodeURIComponent protège le texte
  // tapé pour qu'il passe sans casser l'URL (accents, espaces, &...).
  suggest: (q: string, limit = 6, department?: string) =>
    getJSON<Suggestion[]>(
      `/search/suggest?q=${encodeURIComponent(q)}&limit=${limit}${department ? `&department=${department}` : ""}`,
    ),
};

/* ---- Helpers de présentation (l'API RNA n'a pas tous les champs riches) ---- */

// Renvoie un court texte de présentation pour une association.
// Priorité au "blurb" déjà rédigé ; sinon on tronque la description à ~140
// caractères ; sinon un texte par défaut. But : toujours afficher quelque chose.
export function blurbOf(a: Association): string {
  if (a.blurb) return a.blurb;
  if (a.description) {
    const d = a.description.trim();
    return d.length > 140 ? `${d.slice(0, 137).trimEnd()}…` : d;
  }
  return "Association du Répertoire National des Associations.";
}

// Libellé du bouton d'action (ex sur une fiche), avec un texte par défaut.
export function actionOf(a: Association): string {
  return a.action || "Contacter l'association";
}

// Renvoie l'URL du site web de l'association, ou null si elle n'en a pas.
export function websiteOf(a: Association): string | null {
  return a.social?.website ?? null;
}
