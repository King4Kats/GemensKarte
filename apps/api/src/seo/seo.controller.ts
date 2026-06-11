/**
 * Routes SEO (HORS préfixe /api, voir main.ts) : pages indexables par Google.
 *   GET /vendee            -> index des communes
 *   GET /vendee/:slug      -> page d'une commune (liste des assos en HTML)
 *   GET /sitemap.xml       -> plan du site (toutes les communes)
 *
 * On renvoie directement la chaîne HTML/XML ; @Header fixe le bon Content-Type.
 */
import { Controller, Get, Header, NotFoundException, Param } from "@nestjs/common";
import { SeoService } from "./seo.service";

@Controller()
export class SeoController {
  constructor(private readonly svc: SeoService) {}

  @Get("vendee")
  @Header("Content-Type", "text/html; charset=utf-8")
  index(): Promise<string> {
    return this.svc.indexPage();
  }

  @Get("vendee/:slug")
  @Header("Content-Type", "text/html; charset=utf-8")
  async commune(@Param("slug") slug: string): Promise<string> {
    const html = await this.svc.communePage(slug);
    if (!html) throw new NotFoundException("Commune introuvable");
    return html;
  }

  @Get("sitemap.xml")
  @Header("Content-Type", "application/xml; charset=utf-8")
  sitemap(): Promise<string> {
    return this.svc.sitemap();
  }
}
