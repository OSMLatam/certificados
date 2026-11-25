import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { StreamableFile } from "@nestjs/common";
import { IssueService } from "./issue.service";
import { PermalinkThrottleGuard } from "./permalink-throttle.guard";

type PublicRequest = {
  headers: { "user-agent"?: string; referer?: string };
};

@Controller("public/certificates")
@UseGuards(PermalinkThrottleGuard)
export class PublicCertificateController {
  constructor(@Inject(IssueService) private readonly issue: IssueService) {}

  @Get(":slug/file")
  @Header("Cache-Control", "public, max-age=86400")
  async file(@Param("slug") slug: string, @Query("download") download?: string): Promise<StreamableFile> {
    const file = await this.issue.file(slug);
    const disposition = download === "1" ? "attachment" : "inline";
    return new StreamableFile(file.body, {
      type: file.mimeType,
      disposition: `${disposition}; filename="${file.filename}"`,
      length: file.body.length,
    });
  }

  @Get(":slug")
  metadata(@Param("slug") slug: string, @Req() request: PublicRequest) {
    return this.issue.metadata(slug, request.headers["user-agent"], request.headers.referer);
  }
}
