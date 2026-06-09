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
