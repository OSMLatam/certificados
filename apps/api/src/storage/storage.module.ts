import { Global, Module } from "@nestjs/common";
import { ENV } from "../config/env.token";
import type { AppEnv } from "../config/env";
import { StorageService } from "./storage.service";

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ENV],
      useFactory: (env: AppEnv) => new StorageService(env),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
