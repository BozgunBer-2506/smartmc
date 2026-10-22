import { IsString, MinLength } from "class-validator";

export class AcceptInviteDto {
  @IsString()
  @MinLength(1)
  code!: string;
}
