import { Module } from "@nestjs/common";
import { CredentialsStoreService } from "./credentials-store.service";

@Module({
  providers: [CredentialsStoreService],
  exports: [CredentialsStoreService],
})
export class CredentialsStoreModule {}
