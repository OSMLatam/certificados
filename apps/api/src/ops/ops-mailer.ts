import { Inject, Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";
import type { AppEnv } from "../config/env";
import { ENV } from "../config/env.token";

@Injectable()
export class OpsMailer {
  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  async send(text: string): Promise<void> {
    const transport = nodemailer.createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_PORT === 465,
      auth: this.env.SMTP_USER ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: this.env.SMTP_FROM,
      to: this.env.OPS_ALERT_EMAIL,
      subject: "Aviso de operaciones",
      text,
    });
  }
}
