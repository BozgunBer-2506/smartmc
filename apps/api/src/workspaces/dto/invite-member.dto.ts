import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

export class InviteMemberDto {
  /** Optional lock to one address - same semantics as RegisterDto/BetaInvite. */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Never "owner" - ownership only ever changes via POST /v1/workspace/transfer-ownership. */
  @IsIn(["admin", "member"])
  @IsString()
  role!: "admin" | "member";
}
