/**
 * Outil de validation des données reçues par l'API.
 * Un "pipe" (NestJS) est un filtre que traverse une donnée avant d'arriver dans le contrôleur.
 * Ici, il vérifie que ce que le front envoie (paramètres d'URL, corps de requête)
 * respecte bien un schéma Zod (une "fiche de contrôle" qui décrit la forme attendue).
 * Si c'est invalide, l'API répond une erreur 400 propre plutôt que de planter plus loin.
 */
import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { z, type ZodTypeAny } from "zod";

/** Valide/transforme une entrée (query, body) avec un schéma Zod partagé. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform {
  // On reçoit le schéma à appliquer au moment où on crée le pipe (ex: schéma d'un filtre de recherche).
  constructor(private readonly schema: S) {}

  // Appelé automatiquement par NestJS sur la donnée entrante : on la contrôle puis on la renvoie nettoyée.
  transform(value: unknown): z.infer<S> {
    // safeParse = tente de valider sans planter : on récupère soit un succès, soit les erreurs.
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Donnée non conforme : on renvoie une erreur HTTP 400 avec le détail des champs fautifs.
      throw new BadRequestException({
        message: "Paramètres invalides",
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
