/**
 * Module "Associations" : regroupe le contrôleur (qui reçoit les requêtes HTTP)
 * et le service (qui contient la logique et parle à la base de données).
 * Le service est "exporté" pour que d'autres modules de l'app puissent l'utiliser.
 */
import { Module } from "@nestjs/common";
import { AssociationsController } from "./associations.controller";
import { AssociationsService } from "./associations.service";

@Module({
  controllers: [AssociationsController],
  providers: [AssociationsService],
  exports: [AssociationsService],
})
export class AssociationsModule {}
