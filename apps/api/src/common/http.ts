import { BadRequestException } from "@nestjs/common";

export type FieldDetail = { field: string; message: string; row?: number; value?: string };

export function validationFailed(details: FieldDetail[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: "Bad Request",
    message: "Validation failed",
    details,
  });
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function readRoleCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
