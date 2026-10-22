import { IsString, MinLength } from "class-validator";

export class TransferOwnershipDto {
  /** The target member's userId - must already be a member of this workspace. */
  @IsString()
  @MinLength(1)
  userId!: string;
}
