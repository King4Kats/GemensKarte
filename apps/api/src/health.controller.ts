// Point de contrôle de santé de l'API ("health check"). Quand on visite /api/health,
// l'API répond un petit message "ok". Cela permet à un outil de surveillance ou à un
// serveur de vérifier d'un coup d'œil que l'API est bien démarrée et répond.
import { Controller, Get } from "@nestjs/common";

// @Controller("health") = ce contrôleur répond aux requêtes commençant par /health.
@Controller("health")
export class HealthController {
  // @Get() = répond aux requêtes GET (simple consultation) sur l'adresse /health.
  @Get()
  health(): { status: "ok"; service: string; time: string } {
    return { status: "ok", service: "gemenskarte-api", time: new Date().toISOString() };
  }
}
