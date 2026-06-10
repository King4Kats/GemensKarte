/**
 * Contrôleur des catégories d'associations.
 * Un "contrôleur" (controller) est la porte d'entrée HTTP de l'API : il reçoit
 * les requêtes du front et renvoie une réponse. Ici, il expose la liste des
 * catégories (sport, culture, etc.) avec leur couleur et leur emoji.
 */
import { Controller, Get } from "@nestjs/common";
import { CATEGORIES, type Category } from "@gemenskarte/shared";

// @Controller("categories") = toutes les routes de cette classe commencent par /api/categories
@Controller("categories")
export class CategoriesController {
  /**
   * GET /api/categories — renvoie les catégories "confetti" (couleur + emoji).
   * La liste est figée dans le code partagé (CATEGORIES) : pas de base de données ici,
   * on retourne simplement les valeurs prêtes à l'emploi pour le front.
   */
  @Get()
  findAll(): readonly Category[] {
    return CATEGORIES;
  }
}
