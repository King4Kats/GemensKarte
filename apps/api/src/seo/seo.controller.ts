/**
 * Routes SEO (HORS préfixe /api, voir main.ts) : pages indexables par Google.
 *   GET /sitemap.xml          -> plan du site (toutes les communes, tous départements)
 *   GET /<departement>        -> index des communes du département (ex. /vendee, /lot)
 *   GET /<departement>/<commune> -> page d'une commune (liste des assos en HTML)
 *
 * On renvoie directement la chaîne HTML/XML ; @Header fixe le bon Content-Type.
 * nginx ne route que les slugs de départements couverts vers l'API (le reste = SPA).
 */
import { Controller, Get, Header, NotFoundException, Param } from "@nestjs/common";
import { SeoService } from "./seo.service";

// Préfixe "seo" -> routes réelles /api/seo/... ; nginx réécrit les URL propres
// (/vendee/challans -> /api/seo/vendee/challans) pour que Google voie des URL propres.
@Controller("seo")
export class SeoController {
  constructor(private readonly svc: SeoService) {}

  @Get("sitemap.xml")
  @Header("Content-Type", "application/xml; charset=utf-8")
  sitemap(): Promise<string> {
    return this.svc.sitemap();
  }

  // Index racine de tous les territoires (défini AVANT :dept pour ne pas être avalé).
  @Get("territoires")
  @Header("Content-Type", "text/html; charset=utf-8")
  territoires(): Promise<string> {
    return this.svc.rootIndex();
  }

  @Get(":dept")
  @Header("Content-Type", "text/html; charset=utf-8")
  async deptIndex(@Param("dept") dept: string): Promise<string> {
    const html = await this.svc.deptIndex(dept);
    if (!html) throw new NotFoundException("Département non couvert");
    return html;
  }

  @Get(":dept/:slug")
  @Header("Content-Type", "text/html; charset=utf-8")
  async commune(@Param("dept") dept: string, @Param("slug") slug: string): Promise<string> {
    const html = await this.svc.communePage(dept, slug);
    if (!html) throw new NotFoundException("Commune introuvable");
    return html;
  }
}
