/**
 * Module "contact" : dans NestJS, un module regroupe les pièces qui vont ensemble.
 * Ici on déclare que la fonctionnalité "contact" est composée de son contrôleur
 * (les routes HTTP) et de son service (l'envoi d'email). Ça permet à NestJS de
 * les relier entre eux automatiquement.
 */
import { Module } from "@nestjs/common";
import { ContactController } from "./contact.controller";
import { ContactService } from "./contact.service";

@Module({ controllers: [ContactController], providers: [ContactService] })
export class ContactModule {}
