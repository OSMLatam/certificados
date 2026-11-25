import { Module } from "@nestjs/common";
import { OpsAlertService } from "./ops-alert.service";
import { OpsMailer } from "./ops-mailer";

@Module({
  providers: [OpsAlertService, OpsMailer],
})
export class OpsModule {}
