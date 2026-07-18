import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { ProblemDetailsFilter } from "./common/problem-details.filter";
import { formatValidationErrors } from "./common/format-validation-errors";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableCors({ origin: true, credentials: true });
  app.use(cookieParser());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Produces the {field, code, message}[] shape API.md Section 5
      // documents for RFC 7807's `errors` array, instead of NestJS's
      // default array-of-strings.
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: formatValidationErrors(errors),
          code: "VALIDATION_ERROR",
        }),
    }),
  );

  // ADR-0006: URI versioning. /health and /dev/* are infrastructure/debug
  // concerns, not part of the versioned product API contract.
  app.setGlobalPrefix("v1", {
    exclude: ["health", "dev/(.*)"],
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
