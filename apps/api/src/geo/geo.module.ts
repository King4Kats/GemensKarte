/**
 * Module "géo" de l'API (NestJS).
 * Un "module" regroupe un bout de fonctionnalité. Ici il fournit le
 * GeocoderService : le service qui transforme une adresse en coordonnées GPS
 * (latitude/longitude) pour placer les associations sur la carte.
 */
import { Global, Module } from "@nestjs/common";
import { GeocoderService } from "./geocoder.service";

// @Global() : rend ce module disponible partout dans l'app sans avoir à
// le ré-importer dans chaque module qui en a besoin.
@Global()
@Module({
  providers: [GeocoderService], // service créé/géré par NestJS dans ce module
  exports: [GeocoderService], // rendu accessible aux autres modules de l'app
})
export class GeoModule {}
