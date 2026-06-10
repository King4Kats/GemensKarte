/**
 * Module "Catégories".
 * Dans NestJS, un "module" est une boîte qui regroupe les éléments d'une fonctionnalité.
 * Celui-ci sert juste à brancher le contrôleur des catégories dans l'application.
 */
import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";

@Module({
  // On déclare ici les contrôleurs (les routes HTTP) que ce module rend disponibles.
  controllers: [CategoriesController],
})
export class CategoriesModule {}
