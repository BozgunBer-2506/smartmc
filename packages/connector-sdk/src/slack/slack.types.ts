/**
 * The subset of the Slack Web API + Events API this connector actually
 * uses. https://api.slack.com/web, https://api.slack.com/apis/events-api -
 * not a full SDK.
 */
export interface SlackUser {
  id: string;
  name?: string;
  real_name?: string;
  is_bot?: boolean;
}

export interface SlackChannel {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_im?: boolean;
  /** Whether the bot user is actually a member of this channel - conversations.history 400s with not_in_channel otherwise, even with the right scopes. */
  is_member?: boolean;
}

/**
 * A message, whether delivered live via the Events API (`event` field of
 * an `event_callback` envelope - already carries `channel`) or read back
 * from `conversations.history` (which does not include `channel` per
 * message; `SlackConnector.syncChannels` attaches it before calling
 * mapMessage, so both call sites hand mapMessage() the same shape).
 */
export interface SlackMessage {
  type: string; // "message"
  subtype?: string;
  channel: string;
  user?: string;
  bot_id?: string;
  text: string;
  ts: string; // Slack's message identifier and timestamp in one ("1234567890.123456")
  team?: string;
}

export interface SlackEventCallbackEnvelope {
  type: "event_callback";
  team_id: string;
  event: SlackMessage;
  event_id: string;
  event_time: number;
}

export interface SlackUrlVerificationEnvelope {
  type: "url_verification";
  token: string;
  challenge: string;
}

export type SlackEventEnvelope = SlackEventCallbackEnvelope | SlackUrlVerificationEnvelope;

export interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  bot_user_id?: string;
}

export interface SlackApiErrorBody {
  ok: false;
  error: string;
}
