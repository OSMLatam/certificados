import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminRoleGuard } from "../audit/admin-role.guard";
import { SummaryController, UsersController } from "./admin.controller";
import { SummaryService } from "./summary.service";
import { UsersService } from "./users.service";

@Module({
  imports: [AuthModule],
  controllers: [SummaryController, UsersController],
  providers: [SummaryService, UsersService, AdminRoleGuard],
})
export class AdminModule {}
