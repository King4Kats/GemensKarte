import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Association, Suggestion } from "@gemenskarte/shared";
import { MeiliSearch, type Index } from "meilisearch";
import { getEnv } from "../config/env";

const INDEX = "associations";

/** Document indexé dans Meilisearch (sous-ensemble léger de l'association). */
export interface AssociationDoc {
  id: string;
  name: string;
  categoryId: string;
  description: string | null;
  city: string | null;
  department: string | null;
  tags: string[];
}

export function toSearchDoc(a: Association): AssociationDoc {
  return {
    id: a.id,
    name: a.name,
    categoryId: a.categoryId,
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

  get index(): Index<AssociationDoc> {
    return this.client.index<AssociationDoc>(INDEX);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureIndex();
  }

  /** Crée l'index et fixe les attributs cherchables/filtrables. Idempotent. */
  async ensureIndex(): Promise<void> {
    try {
      await this.client.createIndex(INDEX, { primaryKey: "id" }).catch(() => undefined);
      await this.index.updateSettings({
        searchableAttributes: ["name", "city", "tags", "description"],
        filterableAttributes: ["categoryId", "department"],
        sortableAttributes: ["name"],
        typoTolerance: { enabled: true },
      });
      this.available = true;
      this.logger.log("Index Meilisearch prêt");
    } catch (err) {
      this.available = false;
      this.logger.warn(`Meilisearch indisponible : ${(err as Error).message}`);
    }
  }

  async indexDocuments(docs: AssociationDoc[]): Promise<void> {
    if (docs.length === 0) return;
    try {
      await this.index.addDocuments(docs);
    } catch (err) {
      this.logger.warn(`Indexation échouée : ${(err as Error).message}`);
    }
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      await this.index.deleteDocument(id);
    } catch {
      /* best-effort */
    }
  }

  async clear(): Promise<void> {
    await this.index.deleteAllDocuments().catch(() => undefined);
  }

  /** Autocomplétion : renvoie des suggestions légères pour la barre de recherche. */
  async suggest(q: string, limit: number): Promise<Suggestion[]> {
    if (!this.available) return [];
    try {
      const res = await this.index.search(q, {
        limit,
        attributesToRetrieve: ["id", "name", "categoryId", "city"],
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
