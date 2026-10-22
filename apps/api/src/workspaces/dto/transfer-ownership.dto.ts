import { IsUUID } from "class-validator";

export class TransferOwnershipDto {
  /**
   * The target member's userId - must already be a member of this
   * workspace. Validated as a real UUID (security-audit fix) - a
   * malformed value previously reached the Postgres query directly and
   * surfaced as a raw 500 instead of a clean 400.
   */
  @IsUUID()
  userId!: string;
}
