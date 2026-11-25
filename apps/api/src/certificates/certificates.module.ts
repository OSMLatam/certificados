import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PdfService } from "../pdf/pdf.service";
import { PermalinkPageController, RobotsController } from "./permalink-page.controller";
import { PermalinkThrottleGuard } from "./permalink-throttle.guard";
import { PublicCertificateController } from "./public-certificate.controller";
import { IssueService } from "./issue.service";
import { RetryIssueController } from "./retry.controller";
import { SearchController, SearchPageController } from "./search.controller";
import { SearchService } from "./search.service";
import { SearchThrottleGuard } from "./search-throttle.guard";
import { PrivacyPageController } from "./privacy.controller";
import { AboutPageController } from "./about.controller";

@Module({
  imports: [AuthModule],
  controllers: [PublicCertificateController, RetryIssueController, PermalinkPageController, RobotsController, SearchController, SearchPageController, PrivacyPageController, AboutPageController],
  providers: [IssueService, PdfService, PermalinkThrottleGuard, SearchService, SearchThrottleGuard],
})
export class CertificatesModule {}
