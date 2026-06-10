/**
 * Module racine de l'API NestJS.
 * Il assemble tous les "modules" (briques de l'app : base de données, géo,
 * recherche, associations, etc.) et déclare le contrôleur de santé (health check,
 * une URL qui répond "je suis vivant" pour la surveillance).
 */
import { Module } from "@nestjs/common";
import { AssociationsModule } from "./associations/associations.module";
import { CategoriesModule } from "./categories/categories.module";
import { DbModule } from "./db/db.module";
import { GeoModule } from "./geo/geo.module";
import { HealthController } from "./health.controller";
import { SearchModule } from "./search/search.module";
import { ContactModule } from "./contact/contact.module";
import { StatsModule } from "./stats/stats.module";

@Module({
  imports: [DbModule, GeoModule, SearchModule, CategoriesModule, AssociationsModule, ContactModule, StatsModule],
  controllers: [HealthController],
})
export class AppModule {}
