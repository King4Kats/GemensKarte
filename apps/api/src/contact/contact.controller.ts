/**
 * Contrôleur "contact" : c'est la porte d'entrée HTTP des formulaires du site.
 * Il reçoit deux types de demandes envoyées par le front :
 *  - "recenser"   : une association veut être ajoutée sur la carte.
 *  - "deferencer" : une association veut être retirée de la carte.
 * Son rôle : vérifier que les données reçues sont valides, puis passer la main
 * au service (ContactService) qui s'occupe d'envoyer l'email.
 */
import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RateLimitGuard } from "../common/rate-limit.guard";
import { ContactService } from "./contact.service";

// Schéma de validation (zod = librairie qui vérifie la forme des données reçues)
// pour le formulaire de référencement. Si une donnée ne respecte pas ces règles
// (email mal écrit, nom trop court...), la requête est refusée automatiquement.
const RecenserBody = z.object({
  name:        z.string().min(2).max(200),
  category:    z.string().min(1).max(50),
  city:        z.string().min(1).max(120),
  postalCode:  z.string().regex(/^\d{5}$/).optional(),
  email:       z.string().email(),
  website:     z.string().url().optional().or(z.literal("")),
  description: z.string().min(10).max(1000),
});

// Même idée, mais pour le formulaire de déférencement (demande de retrait).
const DeferenceBody = z.object({
  name:    z.string().min(2).max(200),
  reason:  z.string().min(1).max(100),
  message: z.string().max(500).optional(),
  email:   z.string().email().optional().or(z.literal("")),
});

// @Controller("contact") = toutes les routes ici commencent par /api/contact
// @UseGuards(RateLimitGuard) = anti-spam appliqué aux deux formulaires (par IP).
@Controller("contact")
@UseGuards(RateLimitGuard)
export class ContactController {
  // NestJS fournit automatiquement le service dont on a besoin (injection).
  constructor(private readonly svc: ContactService) {}

  // Endpoint (= point d'entrée HTTP) appelé par le front : POST /api/contact/recenser.
  // @HttpCode(204) = on répond "OK, rien à renvoyer" (succès sans contenu).
  // Le @Body(...) valide d'abord les données avec le schéma RecenserBody.
  @Post("recenser")
  @HttpCode(204)
  async recenser(@Body(new ZodValidationPipe(RecenserBody)) body: z.infer<typeof RecenserBody>) {
    await this.svc.recenser(body);
  }

  // Endpoint POST /api/contact/deferencer : même principe pour le retrait.
  @Post("deferencer")
  @HttpCode(204)
  async deferencer(@Body(new ZodValidationPipe(DeferenceBody)) body: z.infer<typeof DeferenceBody>) {
    await this.svc.deferencer(body);
  }
}
