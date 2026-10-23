import { IsUUID } from "class-validator";

export class SwitchWorkspaceDto {
  /** The workspace to switch the caller's current session into - must already be a member. */
  @IsUUID()
  workspaceId!: string;
}
