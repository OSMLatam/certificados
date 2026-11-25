import "reflect-metadata";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";
import { securityHeaders } from "./security-headers";

loadDotenv({ path: path.resolve(__dirname, "../../../.env") });

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(securityHeaders());
  if (env.TRUST_PROXY > 0) {
    app.set("trust proxy", env.TRUST_PROXY);
  }
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "ready", method: RequestMethod.GET },
      { path: "robots.txt", method: RequestMethod.GET },
      { path: "c/:slug", method: RequestMethod.GET },
      { path: "/", method: RequestMethod.GET },
      { path: "privacy", method: RequestMethod.GET },
      { path: "about", method: RequestMethod.GET },
    ],
  });
  await app.listen(env.PORT);
}

void bootstrap();
