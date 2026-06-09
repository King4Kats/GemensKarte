import { Controller, Get, Query } from "@nestjs/common";
import { SuggestQuery, type Suggestion } from "@gemenskarte/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SearchService } from "./search.service";

@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** GET /api/search/suggest?q=théat&limit=8 — autocomplétion prédictive. */
  @Get("suggest")
  suggest(
    @Query(new ZodValidationPipe(SuggestQuery)) query: SuggestQuery,
  ): Promise<Suggestion[]> {
    return this.search.suggest(query.q, query.limit);
  }
}
