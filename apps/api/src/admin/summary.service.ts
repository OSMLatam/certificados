import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SummaryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async counts() {
    const [events, participants, pending, issued, failed] = await this.prisma.$transaction([
      this.prisma.event.count({ where: { deletedAt: null } }),
      this.prisma.participant.count({ where: { erasedAt: null, event: { deletedAt: null } } }),
      this.prisma.certificate.count({ where: { status: "pending" } }),
      this.prisma.certificate.count({ where: { status: "issued" } }),
      this.prisma.certificate.count({ where: { status: "failed" } }),
    ]);
    return { events, participants, certificates: { pending, issued, failed } };
  }
}
