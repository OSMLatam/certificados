import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EraseController } from "../participants/erase.controller";
import { EraseService } from "../participants/erase.service";
import { ParticipantsService } from "../participants/participants.service";
import { EventAccess } from "./event-access";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { TemplateCatalogController, TemplatesController } from "../templates/templates.controller";
import { TemplatesService } from "../templates/templates.service";

@Module({
  imports: [AuthModule],
  controllers: [EventsController, TemplatesController, TemplateCatalogController, EraseController],
  providers: [EventAccess, EventsService, ParticipantsService, TemplatesService, EraseService],
})
export class EventsModule {}
