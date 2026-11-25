import { Global, Module } from "@nestjs/common";
import { loadEnv } from "./env";
import { ENV } from "./env.token";

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: () => loadEnv(),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
