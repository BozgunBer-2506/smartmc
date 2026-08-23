import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { CredentialsStoreService } from "./credentials-store.service";

@Module({
  imports: [AuditLogModule],
  providers: [CredentialsStoreService],
  exports: [CredentialsStoreService],
})
export class CredentialsStoreModule {}
