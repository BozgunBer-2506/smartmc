// Loads apps/api/.env into process.env before anything else runs - every
// *.config.ts file in this codebase (auth.config.ts, telegram.config.ts,
// discord.config.ts, slack.config.ts) was already written assuming a
// loader like this existed (their doc comments describe an "env with
// documented defaults" pattern), but none had ever actually been wired
// up: DATABASE_URL only ever worked because Prisma's own generated client
// loads .env independently for its own use, which coincidentally leaves
// every other var (PORT, REDIS_HOST, DISCORD_*, SLACK_*) empty unless the
// shell exports them itself. Confirmed via a live SLACK_SIGNING_SECRET
// test (2026-07-27): the value was invisible to the app until exported
// into the real shell environment. This one line is the fix - not a new
// config abstraction (@nestjs/config's ConfigModule would be a second,
// competing pattern next to the one already used everywhere).
import "dotenv/config";
import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { ProblemDetailsFilter } from "./common/problem-details.filter";
import { formatValidationErrors } from "./common/format-validation-errors";

async function bootstrap() {
  // rawBody: true - required by Slack's Events API webhook (SlackController),
  // which must verify an HMAC-SHA256 signature over the exact raw request
  // bytes (docs/SECURITY.md's authenticity requirement); Express's default
  // JSON body parser only ever exposes the already-parsed object.
  //
  // CORS is configured exactly once, here - `NestFactory.create`'s own
  // `cors: true` shortcut was previously ALSO enabled alongside this,
  // stacking two CORS middlewares. The first (`cors: true`) sends a
  // wildcard `Access-Control-Allow-Origin: *`, which browsers reject
  // outright on any credentialed request (`credentials: true`, needed for
  // the refresh-token cookie) - found live via apps/web's own login flow
  // failing with a CORS error in the browser console. `origin: true`
  // reflects the request's actual Origin header instead of a wildcard,
  // which is what credentialed CORS requires.
  const app = await NestFactory.create(AppModule, { rawBody: true });
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
  // concerns, not part of the versioned product API contract. The plain
  // "health" entry only ever excluded the exact `/health` path, not any
  // sub-route under it (Nest's exclude match is exact-string-or-regex,
  // not a prefix) - found live 2026-08-05 debugging a temporary Phase
  // 20.4 diagnostic route that silently landed at `/v1/health/...`
  // instead of `/health/...`. Harmless before now (no health sub-routes
  // existed), fixed here so it doesn't bite the next one.
  app.setGlobalPrefix("v1", {
    exclude: ["health", "health/(.*)", "dev/(.*)", "metrics"],
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
