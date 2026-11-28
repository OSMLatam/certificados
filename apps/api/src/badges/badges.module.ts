import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PermalinkThrottleGuard } from "../certificates/permalink-throttle.guard";
import { BadgeAdminController, BadgeDocumentController, BadgePageController, PublicBadgeController, VerifyController } from "./badges.controller";

@Module({
  imports: [AuthModule],
  controllers: [BadgeDocumentController, BadgePageController, PublicBadgeController, VerifyController, BadgeAdminController],
  providers: [PermalinkThrottleGuard],
})
export class BadgesModule {}
