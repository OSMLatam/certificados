import { Module } from "@nestjs/common";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OsmOAuthClient } from "./osm-oauth.client";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AdminGuard,
    {
      provide: OsmOAuthClient,
      inject: [ENV],
      useFactory: (env: AppEnv) => new OsmOAuthClient(env),
    },
  ],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
