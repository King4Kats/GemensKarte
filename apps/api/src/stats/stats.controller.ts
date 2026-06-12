/**
 * Point d'entrée HTTP des statistiques (côté API NestJS).
 * Quand le front appelle l'adresse /api/stats, c'est ce fichier qui répond.
 * Il ne calcule rien lui-même : il délègue le travail au "service" et renvoie son résultat.
 */
import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { createHash } from "node:crypto";
import { getEnv } from "../config/env";
import { StatsService } from "./stats.service";

const BOT_RE = /bot|crawl|spider|slurp|preview|headless|monitor|curl|wget|python|axios|fetch\b/i;

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

  // POST /stats/track — suivi de fréquentation anonyme (sans cookie). Le front envoie
  // {kind:'page'|'region', path?, dept?}. On NE stocke PAS l'IP : juste un hash quotidien
  // (IP+navigateur+jour+sel) pour compter les visiteurs uniques sans identifier personne.
  @Post("track")
  async track(@Req() req: { headers: Record<string, unknown>; ip?: string }, @Body() body: unknown) {
    const ua = String(req.headers["user-agent"] ?? "");
    if (!ua || BOT_RE.test(ua)) return { ok: true }; // on ignore les robots
    const fwd = req.headers["x-forwarded-for"];
    const ip = String((Array.isArray(fwd) ? fwd[0] : fwd) || req.ip || "?").split(",")[0].trim();
    const day = new Date().toISOString().slice(0, 10);
    const salt = getEnv().ADMIN_TOKEN || "gk";
    const visitor = createHash("sha256").update(`${ip}|${ua}|${day}|${salt}`).digest("hex").slice(0, 16);

    const b = (body ?? {}) as { kind?: unknown; path?: unknown; dept?: unknown };
    const kind = b.kind === "region" ? "region" : "page";
    const pathStr = typeof b.path === "string" ? b.path.slice(0, 120) : null;
    const dept = typeof b.dept === "string" ? b.dept.slice(0, 3) : null;
    await this.svc.track(visitor, kind, pathStr, dept);
    return { ok: true };
  }
}
