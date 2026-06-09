import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health(): { status: "ok"; service: string; time: string } {
    return { status: "ok", service: "gemenskarte-api", time: new Date().toISOString() };
  }
}
