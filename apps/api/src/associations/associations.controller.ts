import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  type Association,
  CreateAssociationInput,
  ListAssociationsQuery,
  type Paginated,
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

  /** GET /api/associations/:id — fiche complète. */
  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe()) id: string): Promise<Association> {
    return this.service.findOne(id);
  }

  /** POST /api/associations — référencement public (statut "pending"). */
  @Post()
  create(
    @Body(new ZodValidationPipe(CreateAssociationInput)) body: CreateAssociationInput,
  ): Promise<Association> {
    return this.service.create(body);
  }
}
