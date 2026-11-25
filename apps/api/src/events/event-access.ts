import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Event } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class EventAccess {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async visible(id: string): Promise<Event> {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) {
      throw new NotFoundException();
    }
    return event;
  }
}
