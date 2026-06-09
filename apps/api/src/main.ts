import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const app = await NestFactory.create(AppModule, { cors: false });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
  });
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  new Logger("Bootstrap").log(`🎉 GemensKarte API → http://localhost:${env.PORT}/api`);
}

void bootstrap();
