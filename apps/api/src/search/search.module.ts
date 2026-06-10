/**
 * Module NestJS qui regroupe tout le code de la recherche (controller + service).
 * Marqué @Global : son SearchService est partagé dans toute l'app, sans avoir à
 * réimporter ce module partout. C'est la "boîte" qui branche la recherche au reste de l'API.
 */
import { Global, Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Global()
@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
