/**
 * Point d'entrée HTTP des statistiques (côté API NestJS).
 * Quand le front appelle l'adresse /api/stats, c'est ce fichier qui répond.
 * Il ne calcule rien lui-même : il délègue le travail au "service" et renvoie son résultat.
 */
import { Controller, Get } from "@nestjs/common";
import { StatsService } from "./stats.service";

// @Controller("stats") = toutes les routes de cette classe commencent par /stats.
@Controller("stats")
export class StatsController {
  // NestJS fournit automatiquement le service (injection de dépendances) : on n'a rien à créer nous-mêmes.
  constructor(private readonly svc: StatsService) {}

  // @Get() = répond à une requête GET sur /stats (lecture des données, sans rien modifier).
  @Get()
  get() {
    return this.svc.getStats();
  }

  // GET /stats/progress — avancement des passes d'enrichissement par réseau (pour l'accueil).
  @Get("progress")
  progress() {
    return this.svc.getProgress();
  }

  // GET /stats/territories — stats par département (pour le détail par territoire).
  @Get("territories")
  territories() {
    return this.svc.getByTerritory();
  }
}
