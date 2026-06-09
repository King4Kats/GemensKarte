import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
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
  @Get("quarantine")
  listQuarantine(
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
  @Patch(":id/quarantine")
  resolveQuarantine(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ResolveQuarantineInput)) body: ResolveQuarantineInput,
  ): Promise<void> {
    return this.service.resolveQuarantine(id, body);
  }

  /** POST /api/associations — référencement public (statut "pending"). */
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateAssociationInput)) body: CreateAssociationInput,
  ): Promise<Association> {
    return this.service.create(body);
  }

  @Patch(":id/category")
  patchCategory(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(PatchCategoryInput)) body: PatchCategoryInput,
  ): Promise<Association> {
    return this.service.patchCategory(id, body);
  }
}
