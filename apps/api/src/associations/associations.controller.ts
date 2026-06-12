/**
 * Contrôleur "Associations" : la porte d'entrée HTTP du module.
 * Chaque méthode correspond à une URL de l'API (un "endpoint", c'est-à-dire une
 * adresse que le front appelle). Le contrôleur ne fait que recevoir/valider la
 * requête puis déléguer tout le travail au service.
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  type Association,
  CreateAssociationInput,
  ListAssociationsQuery,
  PatchCategoryInput,
  type Paginated,
  type QuarantineAssoc,
  ResolveQuarantineInput,
} from "@gemenskarte/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminGuard } from "../common/admin.guard";
import { RateLimitGuard } from "../common/rate-limit.guard";
import { TriageRateLimitGuard } from "../common/triage-rate-limit.guard";
import { AssociationsService } from "./associations.service";

@Controller("associations")
export class AssociationsController {
  constructor(private readonly service: AssociationsService) {}

  /** GET /api/associations — liste filtrée (catégorie, bbox, texte) + tri distance. */
  @Get()
  list(
    @Query(new ZodValidationPipe(ListAssociationsQuery)) query: ListAssociationsQuery,
  ): Promise<Paginated<Association>> {
    return this.service.list(query);
  }

  /** GET /api/associations/geojson — pins pour la carte (déclaré avant :id). */
  @Get("geojson")
  geojson(@Query(new ZodValidationPipe(ListAssociationsQuery)) query: ListAssociationsQuery) {
    return this.service.geojson(query);
  }

  /** GET /api/associations/quarantine — fiches avec liens à arbitrer (déclaré avant :id). */
  // Route d'ADMIN : réservée (jeton x-admin-token requis), sinon n'importe qui
  // verrait/modifierait les données en attente de modération.
  @Get("quarantine")
  @UseGuards(AdminGuard)
  listQuarantine(
    @Query("page") page = "1",
    @Query("limit") limit = "50",
  ): Promise<Paginated<QuarantineAssoc>> {
    return this.service.listQuarantine(Number(page) || 1, Math.min(Number(limit) || 50, 200));
  }

  /** GET /api/associations/quarantine/public — liste PUBLIQUE (tri collaboratif). */
  // Volontairement ouverte à tous : c'est la file que la communauté vient trier.
  // (déclarée avant :id pour ne pas être capturée par la route paramétrée).
  @Get("quarantine/public")
  listQuarantinePublic(
    @Query("page") page = "1",
    @Query("limit") limit = "50",
  ): Promise<Paginated<QuarantineAssoc>> {
    return this.service.listQuarantine(Number(page) || 1, Math.min(Number(limit) || 50, 200));
  }

  /** GET /api/associations/:id — fiche complète. */
  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe()) id: string): Promise<Association> {
    return this.service.findOne(id);
  }

  /** PATCH /api/associations/:id/quarantine — garder (→ social) ou jeter un lien. */
  // Route d'ADMIN : écrit dans les données affichées -> jeton requis.
  @Patch(":id/quarantine")
  @UseGuards(AdminGuard)
  resolveQuarantine(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ResolveQuarantineInput)) body: ResolveQuarantineInput,
  ): Promise<void> {
    return this.service.resolveQuarantine(id, body);
  }

  /** PATCH /api/associations/:id/quarantine/public — tri collaboratif (1 clic). */
  // Public mais anti-rafale (TriageRateLimitGuard) : garde (→ social) ou jette un
  // lien. Réutilise la même logique que l'admin ; tout reste tracé/réversible (meta).
  @Patch(":id/quarantine/public")
  @UseGuards(TriageRateLimitGuard)
  resolveQuarantinePublic(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ResolveQuarantineInput)) body: ResolveQuarantineInput,
  ): Promise<void> {
    return this.service.resolveQuarantine(id, body);
  }

  /** POST /api/associations — référencement public (statut "pending"). */
  // Public mais limité en débit (anti-spam) : formulaire ouvert à tous.
  @Post()
  @UseGuards(RateLimitGuard)
  create(
    @Body(new ZodValidationPipe(CreateAssociationInput)) body: CreateAssociationInput,
  ): Promise<Association> {
    return this.service.create(body);
  }

  /** PATCH /api/associations/:id/category — change la catégorie d'une fiche (modération). */
  // Route d'ADMIN : modifie une fiche -> jeton requis.
  @Patch(":id/category")
  @UseGuards(AdminGuard)
  patchCategory(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(PatchCategoryInput)) body: PatchCategoryInput,
  ): Promise<Association> {
    return this.service.patchCategory(id, body);
  }
}
