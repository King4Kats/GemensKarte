/**
 * Cœur de la recherche : ce service parle au moteur Meilisearch (recherche rapide
 * et tolérante aux fautes de frappe). Il sait préparer l'index, y ajouter/retirer
 * des associations, et fournir l'autocomplétion utilisée par la barre de recherche.
 */
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { CATEGORIES, type Association, type Suggestion } from "@gemenskarte/shared";
import { MeiliSearch, type Index } from "meilisearch";
import { getEnv } from "../config/env";

const INDEX = "associations";

/** id de catégorie -> libellé lisible (ex. "culture" -> "Culture"), pour rendre la
 *  recherche thématique possible ("musique", "sport", "culture"…). */
export const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

/** Synonymes : permet de chercher en anglais ou variantes ("music"->"musique"). */
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  music: ["musique", "musical", "chorale", "orchestre"],
  musique: ["music", "musical", "chorale", "orchestre"],
  sport: ["sports", "sportive", "sportif"],
  foot: ["football"],
  basket: ["basketball"],
  velo: ["cyclisme", "vtt"],
  danse: ["dance"],
  theatre: ["theatre", "comedie"],
  asso: ["association"],
};

/** Document indexé dans Meilisearch (sous-ensemble léger de l'association). */
export interface AssociationDoc {
  id: string;
  name: string;
  categoryId: string;
  categoryLabel: string;
  description: string | null;
  city: string | null;
  department: string | null;
  tags: string[];
}

/** Transforme une association complète en sa version allégée prête à être indexée
 *  (on ne garde que les champs utiles à la recherche). */
export function toSearchDoc(a: Association): AssociationDoc {
  return {
    id: a.id,
    name: a.name,
    categoryId: a.categoryId,
    categoryLabel: CAT_LABEL[a.categoryId] ?? "",
    description: a.description,
    city: a.city,
    department: a.department,
    tags: a.tags,
  };
}

/**
 * Recherche prédictive (autocomplétion tolérante aux fautes) via Meilisearch.
 * Dégrade proprement si le moteur est indisponible : renvoie [] plutôt que de planter.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: MeiliSearch;
  private available = false;

  constructor() {
    const env = getEnv();
    this.client = new MeiliSearch({ host: env.MEILI_HOST, apiKey: env.MEILI_MASTER_KEY });
  }

  /** Raccourci vers l'index "associations" du moteur (= la "table" de recherche). */
  get index(): Index<AssociationDoc> {
    return this.client.index<AssociationDoc>(INDEX);
  }

  // onModuleInit() est appelé automatiquement par NestJS au démarrage de l'app :
  // on en profite pour s'assurer que l'index existe et est bien configuré.
  async onModuleInit(): Promise<void> {
    await this.ensureIndex();
  }

  /** Crée l'index et fixe les attributs cherchables/filtrables. Idempotent. */
  async ensureIndex(): Promise<void> {
    try {
      await this.client.createIndex(INDEX, { primaryKey: "id" }).catch(() => undefined);
      await this.index.updateSettings({
        searchableAttributes: ["name", "city", "categoryLabel", "tags", "description"],
        filterableAttributes: ["categoryId", "department"],
        sortableAttributes: ["name"],
        typoTolerance: { enabled: true },
        synonyms: SEARCH_SYNONYMS,
      });
      // Tout s'est bien passé : on note que le moteur est utilisable.
      this.available = true;
      this.logger.log("Index Meilisearch prêt");
    } catch (err) {
      // Si Meili est éteint/injoignable, on ne plante pas l'API : on désactive
      // juste la recherche (available = false) et on log un avertissement.
      this.available = false;
      this.logger.warn(`Meilisearch indisponible : ${(err as Error).message}`);
    }
  }

  /** Ajoute (ou met à jour) des associations dans l'index de recherche. */
  async indexDocuments(docs: AssociationDoc[]): Promise<void> {
    if (docs.length === 0) return;
    try {
      await this.index.addDocuments(docs);
    } catch (err) {
      this.logger.warn(`Indexation échouée : ${(err as Error).message}`);
    }
  }

  /** Retire une association de l'index (ex. si elle est supprimée ou dépubliée).
   *  best-effort = on essaie sans bloquer ; si ça échoue, tant pis, on continue. */
  async deleteDocument(id: string): Promise<void> {
    try {
      await this.index.deleteDocument(id);
    } catch {
      /* best-effort */
    }
  }

  /** Vide complètement l'index (supprime tous les documents). */
  async clear(): Promise<void> {
    await this.index.deleteAllDocuments().catch(() => undefined);
  }

  /** Autocomplétion : renvoie des suggestions légères pour la barre de recherche. */
  async suggest(q: string, limit: number, department?: string): Promise<Suggestion[]> {
    // Si le moteur n'est pas dispo, on renvoie une liste vide plutôt que d'échouer.
    if (!this.available) return [];
    try {
      // On limite le nombre de résultats et on ne récupère que les champs utiles.
      // Si un département est fourni, on filtre dessus (ex. n'afficher que la Vendée).
      const res = await this.index.search(q, {
        limit,
        attributesToRetrieve: ["id", "name", "categoryId", "city"],
        ...(department ? { filter: `department = "${department}"` } : {}),
      });
      return res.hits.map((h) => ({
        id: h.id,
        name: h.name,
        categoryId: h.categoryId as Suggestion["categoryId"],
        city: h.city,
      }));
    } catch (err) {
      this.logger.warn(`Recherche échouée : ${(err as Error).message}`);
      return [];
    }
  }
}
