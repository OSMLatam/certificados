import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LegalController } from "./legal.controller";
import { LegalService } from "./legal.service";

@Module({
  imports: [AuthModule],
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
