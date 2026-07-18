import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ProblemDetailsFilter } from "./common/problem-details.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalFilters(new ProblemDetailsFilter());

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
