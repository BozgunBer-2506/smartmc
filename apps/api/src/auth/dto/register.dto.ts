import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters long." })
  @MaxLength(128, { message: "Password must be at most 128 characters long." })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
