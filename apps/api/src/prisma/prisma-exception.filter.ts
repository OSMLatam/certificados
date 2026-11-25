import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    if (error.code === "P2023") {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: 400,
        error: "Bad Request",
        message: "El identificador no es válido.",
        details: [{ field: "id", message: "El identificador no es válido." }],
      });
      return;
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Error interno.",
      details: [],
    });
  }
}
