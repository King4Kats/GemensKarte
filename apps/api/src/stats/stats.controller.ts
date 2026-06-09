import { Controller, Get } from "@nestjs/common";
import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get()
  get() {
    return this.svc.getStats();
  }
}
