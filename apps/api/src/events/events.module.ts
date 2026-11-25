import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ParticipantsService } from "../participants/participants.service";
import { EventAccess } from "./event-access";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { TemplateCatalogController, TemplatesController } from "../templates/templates.controller";
import { TemplatesService } from "../templates/templates.service";

@Module({
  imports: [AuthModule],
  controllers: [EventsController, TemplatesController, TemplateCatalogController],
  providers: [EventAccess, EventsService, ParticipantsService, TemplatesService],
})
export class EventsModule {}
