import { IsIn, IsString } from "class-validator";

export class ChangeMemberRoleDto {
  /** Never "owner" here - ownership only changes via POST /v1/workspace/transfer-ownership. */
  @IsIn(["admin", "member"])
  @IsString()
  role!: "admin" | "member";
}
