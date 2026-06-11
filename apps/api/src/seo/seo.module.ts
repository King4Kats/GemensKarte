/**
 * Module "SEO" : regroupe le controller (pages /vendee, sitemap) et le service
 * qui génère le HTML. La base de données est fournie globalement (DbModule).
 */
import { Module } from "@nestjs/common";
import { SeoController } from "./seo.controller";
import { SeoService } from "./seo.service";

@Module({ controllers: [SeoController], providers: [SeoService] })
export class SeoModule {}
