/**
 * Porte d'entrée HTTP de la recherche (un "controller" NestJS = il reçoit les
 * requêtes du navigateur et appelle le service qui fait le vrai travail).
 * Ici une seule route : l'autocomplétion de la barre de recherche.
 */
import { Controller, Get, Query } from "@nestjs/common";
import { SuggestQuery, MatchQuery, type Suggestion } from "@gemenskarte/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SearchService } from "./search.service";

@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** GET /api/search/suggest?q=théat&limit=8 — autocomplétion prédictive. */
  // Le ZodValidationPipe vérifie/nettoie les paramètres de l'URL (?q=, ?limit=…)
  // avant qu'ils n'arrivent ici : on est sûr de recevoir des valeurs valides.
  @Get("suggest")
  suggest(
    @Query(new ZodValidationPipe(SuggestQuery)) query: SuggestQuery,
  ): Promise<Suggestion[]> {
    return this.search.suggest(query.q, query.limit, query.department);
  }

  /** GET /api/search/match?q=music&department=85 — tous les ids d'assos qui matchent
   *  un mot-clé (nom OU descriptif), pour filtrer les points de la carte. */
  @Get("match")
  match(
    @Query(new ZodValidationPipe(MatchQuery)) query: MatchQuery,
  ): Promise<string[]> {
    return this.search.matchIds(query.q, query.department);
  }
}
