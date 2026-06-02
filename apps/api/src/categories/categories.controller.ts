import { Controller, Get } from "@nestjs/common";
import { CATEGORIES, type Category } from "@gemenskarte/shared";

@Controller("categories")
export class CategoriesController {
  /** GET /api/categories — les catégories "confetti" (couleur + emoji). */
  @Get()
  findAll(): readonly Category[] {
    return CATEGORIES;
  }
}
