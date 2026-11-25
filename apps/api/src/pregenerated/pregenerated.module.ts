import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventAccess } from "../events/event-access";
import { PregeneratedFileController, PregeneratedImportController } from "./pregenerated.controller";
import { PregeneratedService } from "./pregenerated.service";

@Module({
  imports: [AuthModule],
  controllers: [PregeneratedImportController, PregeneratedFileController],
  providers: [PregeneratedService, EventAccess],
})
export class PregeneratedModule {}
