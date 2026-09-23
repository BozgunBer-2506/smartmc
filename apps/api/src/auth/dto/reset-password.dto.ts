import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  token!: string;

  // Length bounds only - the real policy (breach check included) is
  // PasswordService.validatePolicy/isKnownBreached, applied identically
  // to registration inside PasswordResetService. These decorators just
  // reject an obviously-malformed request before any DB/network work.
  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters long." })
  @MaxLength(128, { message: "Password must be at most 128 characters long." })
  newPassword!: string;
}
