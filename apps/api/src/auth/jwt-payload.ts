/** The access token's claims - API.md Section 7.1: no PII beyond user id. */
export interface JwtPayload {
  sub: string; // user id
  workspaceId: string;
  orgId: string;
  role: string; // "owner" | "admin" | "member" - embedded at issuance so RolesGuard needs no DB round-trip within the token's 15-minute life
  scopes: string[];
  iat: number;
  exp: number;
}
