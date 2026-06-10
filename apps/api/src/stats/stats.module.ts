/**
 * Module "Stats" : c'est la boîte qui regroupe tout ce qui concerne les statistiques.
 * Dans NestJS, un module relie ensemble le controller (qui reçoit les requêtes HTTP)
 * et le service (qui fait le calcul), pour que l'application sache qu'ils existent.
 */
import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

// controllers = qui répond aux requêtes ; providers = les services réutilisables (ici le calcul des stats).
@Module({ imports: [], controllers: [StatsController], providers: [StatsService] })
export class StatsModule {}
