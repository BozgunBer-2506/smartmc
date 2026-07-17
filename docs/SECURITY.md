# Smart Message Center - SECURITY.md

```yaml
Title: SECURITY.md
Version: 1.0
Status: Approved
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - PRODUCT.md
  - ARCHITECTURE.md
  - DATABASE.md
  - API.md
Related ADRs:
  - ADR-0004
  - ADR-0009
  - ADR-0010
```

Scope: the threat model, credential/secrets handling, audit logging specification, and GDPR data-handling policy for Smart Message Center. This document makes explicit the security assumptions that `API.md`'s auth model and `DATABASE.md`'s credential-storage design already depend on - it does not introduce new architecture, it formalizes the security contract the existing architecture was already implicitly built against.

---

## 1. Security Philosophy

1. **This product's threat model is unusually concentrated.** A single Smart Message Center account, once compromised, exposes not just our data but the victim's Telegram, Discord, Slack, and Email accounts simultaneously (via stored connector credentials) - PRODUCT.md's Brand section already names this explicitly ("messaging aggregators are a high-value target"). Every decision in this document is calibrated against that concentration risk, not against a generic SaaS threat model.
2. **Credentials are never trusted to the primary datastore.** This principle already runs through `DATABASE.md` (`credentials_ref` pointers, never raw tokens) and `API.md` (billing never touches card data). This document is where that principle is stated once, centrally, as policy - every other document's credential-handling decisions trace back to here.
3. **Defense in depth, not a single perimeter.** Authentication, authorization, RLS-readiness, network segmentation, and secrets management are independent layers (Section 4-9); a failure in one must not be a total compromise.
4. **Security is inspectable, matching the product's own UX principle.** PRODUCT.md's UI Principles state automations must be inspectable, not magical - the same standard applies to security: every sensitive action is audit-logged (Section 8), every credential's blast radius is documented (Section 5), and this document itself is the thing a security reviewer or an enterprise customer's due-diligence team reads first, not something reconstructed from code.
5. **Least privilege, applied to humans, services, and database roles alike** (DATABASE.md Section 21's role separation is the database-layer instance of this; this document extends the same principle to IAM, secrets access, and support-staff tooling).

---

## 2. Threat Model

### 2.1 Assets (ranked by sensitivity)

1. **Connector credentials** (`credentials_ref` targets - Telegram bot tokens, Discord/Slack OAuth tokens, IMAP/SMTP credentials) - compromise gives an attacker live access to the victim's actual messaging accounts, not just Smart Message Center data. Highest sensitivity in the system.
2. **Message content and attachments** - potentially includes financial information (PRODUCT.md's Finance-tag automation examples), personal/health information, business-confidential content (an investor conversation, a legal contract).
3. **Authentication credentials** (password hashes, 2FA secrets, passkey credentials, session/refresh tokens) - compromise enables account takeover, which cascades to asset #1.
4. **API keys and OAuth client secrets** (third-party integrations, Phase 18) - compromise enables programmatic access to a workspace's data.
5. **Billing/payment relationship data** (never raw card data, per `API.md` Section 10.9 and `DATABASE.md` Section 6.16 - the asset here is the *relationship* metadata, not payment instruments, which we deliberately never hold).
6. **Audit logs and rule-execution history** - lower direct sensitivity, but tampering with these undermines every other control's accountability, so their integrity is itself an asset (Section 8).

### 2.2 Actors

- **External attacker, unauthenticated** - targets public endpoints, OAuth flows, webhook receivers.
- **External attacker, credential-stuffing/phishing** - targets user accounts directly, the single highest-value attack path given asset #1's concentration risk.
- **Malicious or compromised third-party integration** (Phase 18 marketplace) - a registered OAuth client or connector abusing granted scopes.
- **Malicious insider / compromised platform-staff credential** - the admin API's separate authentication tier (`API.md` Section 10.10) exists specifically to bound this actor's blast radius.
- **Compromised dependency** (supply-chain attack via an npm package) - relevant given the scale of the connector/automation ecosystem this product is built toward.
- **A well-intentioned but careless connector implementation** (third-party, Phase 18) - not malicious, but a bug in a community connector should not be able to compromise the core platform; this is a design constraint on the Connector SDK (ADR-0004), not just a policy statement.

### 2.3 Primary Attack Surfaces

| Surface | Primary risk | Primary mitigation (see section) |
|---|---|---|
| Public API (`api.smartmessagecenter.com`) | Injection, auth bypass, rate-limit abuse | Section 4 (auth), Section 10 (app security), API.md Section 9 (rate limiting) |
| OAuth2 authorization flows (first-party and third-party) | Token theft, authorization code interception, scope escalation | Section 4.1, PKCE (API.md Section 7.1) |
| Inbound provider webhooks (Telegram/Discord/Slack/Email ingestion) | Spoofed events, replay, malformed payloads reaching the connector-sdk | Section 9.3, signature verification, ADR-0004's isolation design |
| Outbound webhooks (`API.md` Section 14.2) | A receiving third-party endpoint being handed a forged payload claiming to be us | HMAC signing (Section 9.4) |
| Connector credential storage | Credential leakage via backup, replica, or query bug | Section 5 (secrets management) |
| File uploads/downloads (`API.md` Section 13) | Malware distribution via attachments, unauthorized access via guessable URLs | Section 10.4, pre-signed short-lived URLs, virus scanning |
| Admin surface | Privilege escalation, platform-wide blast radius | Section 4.4, separate auth tier |
| Third-party connectors/marketplace (Phase 18) | Supply-chain-style compromise via a malicious or buggy community connector | Section 9.5 |

---

## 3. Data Classification

| Class | Examples | Handling requirement |
|---|---|---|
| **Restricted** | Connector credentials, auth secrets (password hashes, 2FA seeds, passkey keys), API key secrets, webhook signing secrets | Never in the primary datastore in retrievable form (Section 5); encrypted at rest in the secrets manager; access logged (Section 8) |
| **Confidential** | Message content, attachments, contact PII, AI-generated summaries | Encrypted at rest (Section 6) and in transit; workspace-scoped access only; subject to GDPR erasure (Section 7) |
| **Internal** | Rule definitions, automation execution logs, notification preferences | Workspace-scoped; not independently sensitive outside the context of the confidential data they reference |
| **Public** | Provider catalog (`providers` table), public rule templates, marketing content | No special handling |

This classification is the practical basis for every "why is this field handled this way" decision already made in `DATABASE.md` (e.g. `raw_payload` redaction, `credentials_ref` indirection) - restated here as an explicit policy so future schema/API additions can be classified consistently rather than by individual judgment call each time.

---

## 4. Authentication & Session Security

Extends `ARCHITECTURE.md` Section 6 and `API.md` Section 7.1 with the specific security controls, not just the flow shape.

### 4.1 Password & Account Security

- Passwords hashed with **Argon2id** (memory-hard, resistant to GPU-accelerated cracking), never a faster hash (bcrypt/SHA-family) - a deliberate choice given asset #1's concentration risk makes offline password-cracking resistance disproportionately valuable here.
- Minimum password policy enforced client- and server-side: length-based (12+ characters) rather than arbitrary complexity rules, per current best practice (complexity rules drive predictable patterns, length drives real entropy).
- **Breach-list checking** at signup/password-change time (k-anonymity API pattern, e.g. Have I Been Pwned's range query - no plaintext password ever leaves the client for this check) - rejects passwords already known to be compromised elsewhere.
- **Account lockout / progressive delay** on repeated failed login attempts, keyed on both account and source IP independently, to resist both credential-stuffing (many accounts, one IP pattern) and targeted brute force (one account, many IPs).
- **Passkeys (WebAuthn) are the recommended, promoted default**, not just an option - phishing-resistant by construction, and the natural answer to asset #1's concentration risk: a passkey cannot be phished the way a password can.

### 4.2 Two-Factor Authentication

- TOTP-based 2FA, standard (RFC 6238), with recovery codes issued once at enrollment (shown once, hashed at rest identically to how API keys are handled - `DATABASE.md` Section 6.19's pattern).
- 2FA changes (enable/disable/recovery-code regeneration) go through the narrow, dedicated endpoints specified in `API.md` Section 10.2, each triggering a mandatory audit log entry (Section 8) and an out-of-band notification email to the account owner - so a silent 2FA-disable by an attacker who's gained session access is caught by the legitimate user, not discovered later.

### 4.3 Session & Token Security

- Short-lived JWT access tokens (15 min) + rotating refresh tokens with reuse detection (`ARCHITECTURE.md` Section 6, `DATABASE.md` Section 6.20's `family_id` design) - a stolen, already-rotated refresh token being replayed revokes the entire session family immediately, not just that one token.
- Refresh tokens stored httpOnly + Secure + SameSite=Strict (web) or platform secure storage (desktop/mobile) - never accessible to client-side JavaScript, closing the primary XSS-to-session-theft path.
- JWTs carry no PII beyond `sub`/`workspaceId`/`orgId`/`scopes` (API.md Section 7.1) - a logged or leaked JWT is not itself a data breach.
- **Session visibility and revocation**: users can view active sessions (device, location approximation, last active) and revoke individually or "log out everywhere" - a direct control surface for asset #1's concentration risk (if a device is lost or a session looks unfamiliar, the user can act immediately).

### 4.4 Admin Authentication (separate tier)

Per `API.md` Section 10.10: platform-staff admin access uses **entirely separate credentials and a separate authentication tier**, never a normal workspace-scoped user token with an elevated role. Concretely: separate identity provider integration (e.g. SSO restricted to company-owned accounts, mandatory hardware-key 2FA), separate session lifetime (shorter), and every admin action is audit-logged with no exceptions (Section 8). This is what makes the "malicious/compromised insider" actor (Section 2.2) a bounded risk rather than an unbounded one - an attacker who compromises a normal user's workspace-owner account gains that one workspace, never platform-wide reach.

---

## 5. Secrets & Credential Management

This section is the canonical statement of a principle already assumed throughout `DATABASE.md` and `ARCHITECTURE.md`: **the primary Postgres database never holds a retrievable secret.**

### 5.1 What Goes Where

| Secret type | Storage location | Retrievable by application? |
|---|---|---|
| Connector credentials (bot tokens, OAuth tokens, IMAP passwords) | Secrets manager (AWS Secrets Manager / HashiCorp Vault, `ARCHITECTURE.md` Section 7) | Yes - required to make provider API calls on the user's behalf |
| User passwords | Postgres `user_credentials`, Argon2id-hashed | No - verify-only |
| API key secrets | Postgres `api_keys.key_hash`, hashed | No - verify-only (`DATABASE.md` Section 6.19) |
| Webhook signing secrets | Postgres `webhooks.secret` | Yes - required to compute HMAC signatures on delivery |
| TLS certificates, database credentials, third-party API keys (Stripe, OpenAI/model provider) | Secrets manager, injected as environment/runtime secrets, never committed to the repository | Yes, scoped per service |
| 2FA recovery codes | Postgres, hashed identically to API keys | No - verify-only |

### 5.2 Why Connector Credentials Specifically Are Retrievable (and how that's bounded)

Unlike passwords/API keys, connector credentials must be retrievable (the platform needs the actual Telegram bot token to call Telegram's API) - this is an unavoidable consequence of the product's function, not a design gap. It is bounded by:
- **Indirection**: Postgres holds only `credentials_ref` (DATABASE.md Section 6.5), never the credential itself - a database compromise alone does not yield usable credentials.
- **Access scoping**: only the connector worker for the specific provider/workspace pair can request a given secret from the secrets manager (IAM-scoped, per-connector-worker identity, not a shared "any backend service can read any secret" grant).
- **Access logging**: every secret retrieval is logged by the secrets manager itself (independent of our application's own audit log, Section 8) - a second, harder-to-tamper-with record of who/what accessed which credential and when.
- **Revocation on disconnect**: `API.md` Section 10.5 already specifies that disconnecting a LinkedAccount unconditionally deletes the secret from the secrets manager, regardless of whether provider-side revocation succeeds - restated here as policy: **the secret being unusable from our side is the guarantee we make; provider-side revocation is best-effort on top of it, never the primary guarantee.**

### 5.3 Secret Rotation

- Platform-level secrets (database credentials, TLS certs, service-to-service credentials) rotate on a defined schedule (90 days for most; shorter for anything with a wider blast radius) via the secrets manager's native rotation tooling, not manual process.
- User-controlled credentials (connector tokens, API keys) rotate on user action (reconnect, regenerate) - the platform does not silently rotate a user's Telegram bot token, since that could break the user's other integrations with the same bot; instead, `LinkedAccount.status = reauth_required` (DATABASE.md Section 6.5) prompts the user when a credential needs attention.
- API keys support a **grace-period rotation pattern**: generating a new key does not immediately revoke the old one (configurable overlap window), so a scripted integration doesn't break the moment a key is rotated - directly mirroring `API.md` Section 3's deprecation-window philosophy applied to credentials instead of endpoints.

---

## 6. Data Protection At Rest & In Transit

- **In transit**: TLS 1.2+ enforced everywhere (public API, internal service-to-service, database connections, Redis connections) - no exceptions, including internal cluster traffic (a compromised pod on the network should not be able to sniff plaintext traffic between services).
- **At rest**: Postgres encrypted at rest (RDS's native encryption, `ARCHITECTURE.md` Section 7), S3 attachments encrypted at rest (SSE-S3 or SSE-KMS), Redis encrypted at rest where the managed offering supports it.
- **Field-level consideration**: message content is not separately field-level-encrypted beyond disk-level encryption at MVP - **why not full field-level/end-to-end encryption of message content**: end-to-end encryption would be fundamentally incompatible with the product's core function (server-side rule evaluation, search, AI features all require plaintext access to message content at processing time) - this is an explicit, documented tradeoff, not an oversight, and it's precisely why Section 5's credential-indirection and Section 4's access controls carry proportionally more weight: message content confidentiality rests on access control and infrastructure encryption, not on the content being unreadable to the platform itself.
- **Backups**: encrypted identically to primary storage, access-logged, and included in the same retention/GDPR-erasure scope as primary data (a backup is not a loophole around erasure requirements - Section 7.3).

---

## 7. GDPR & Data Privacy

Extends `DATABASE.md` Section 15 with the operational policy layer.

### 7.1 Legal Basis & Data Minimization

- Processing is based on contract necessity (delivering the service the user signed up for) for core functionality, and consent for optional AI features (PRODUCT.md's AI-is-optional principle has a direct privacy-law benefit here: AI processing of message content is opt-in, so consent is cleanly separable from the core service).
- Data minimization is enforced at write time, not read time (`DATABASE.md` Section 6.8's `raw_payload` redaction-at-ingestion is the concrete mechanism) - the policy stated here is that **any new field added to the schema is evaluated for necessity before it's added**, not collected by default "in case it's useful later."

### 7.2 Data Subject Rights

| Right | Mechanism |
|---|---|
| Access | `API.md`'s data export capability (Section 10, referencing PRODUCT.md solution #60) - a self-service export, not a manual support request, for the common case; manual process as a fallback for edge cases |
| Rectification | Standard resource `PATCH` endpoints for user-editable data; a support-mediated process for data the user can't self-edit (e.g. correcting a misattributed message sender after a connector bug) |
| Erasure | The `data_erasure_requests`-driven workflow (`DATABASE.md` Section 15) - deliberate, application-orchestrated, audited, never an ad hoc `DELETE` |
| Portability | Same export mechanism as Access, in a structured, machine-readable format (JSON/CSV) |
| Restriction of processing | A workspace-level "pause AI processing" / "pause automation" toggle - since those are the processing activities beyond pure storage/display |
| Object | Consent withdrawal for AI features immediately halts related processing (enforced the same way PRODUCT.md's AI-optional principle is enforced everywhere else: features degrade gracefully, they don't error) |

### 7.3 Retention & Erasure Timelines

- Soft-deleted data (`DATABASE.md` Section 7) is purged from primary storage and backups on a defined schedule after soft-delete (recommended: 90 days, giving a genuine "undo" window without indefinite retention).
- A formal erasure request (Section 7.2) has a **stricter, faster timeline**: acknowledged within 72 hours, completed within 30 days (aligned with GDPR Article 12's one-month default), including from backups reached by the next backup-rotation cycle following the request - backups are not held indefinitely specifically so this timeline is achievable in practice, not just on paper.
- Workspace-configurable retention policies (`DATABASE.md` Section 15) let a workspace set a shorter default retention than the platform maximum - relevant for Phase 17 enterprise customers with their own compliance requirements.

### 7.4 Data Residency & Sub-processors

- MVP: single AWS region (`ARCHITECTURE.md` Section 7's infrastructure design). EU data residency as an option is a Phase 17 (Enterprise) commitment, not an MVP one - documented here so it isn't quietly promised earlier than the infrastructure supports.
- **Sub-processor list** (AWS, Cloudflare, the AI model provider(s), the email/SMTP relay if third-party, the billing provider) is maintained as a living, publicly documented list per standard GDPR sub-processor transparency practice - tracked as a Phase 2-era documentation task (before real user data exists in production is the deadline that matters, not a specific phase number).

### 7.5 Breach Notification

- A defined incident response process (Section 11) includes a specific GDPR-triggered path: confirmed personal-data breach → assessment of notification obligation → supervisory authority notification within 72 hours where required → affected-user notification "without undue delay" where the breach poses a high risk. This is a process commitment recorded here; the operational runbook itself belongs in an incident-response playbook (Phase 2/17 artifact, out of this document's scope).

---

## 8. Audit Logging Specification

Extends `DATABASE.md` Section 6.21/8 with the policy layer: what must be logged, by whom it can be read, and how its integrity is protected.

### 8.1 What Is Logged (mandatory, not optional per-feature)

- Authentication events: login (success/failure), logout, password change, 2FA enable/disable, passkey registration/removal, session revocation.
- Authorization-relevant events: role changes, workspace membership changes, API key creation/revocation.
- Data-sensitive actions: LinkedAccount connect/disconnect, Rule creation/modification/deletion, data export requests, erasure requests.
- Admin actions (Section 4.4): every single admin-tier action, with no exceptions - this is the one category where "log everything, no sampling, no exceptions" is an absolute rule given the blast radius.
- Billing changes: plan changes, seat changes, payment method changes (the change event, never the payment instrument itself).

### 8.2 What Is Deliberately NOT Logged in `audit_logs`

Per `DATABASE.md` Section 8's distinction: routine automation firing (`rule_execution_logs`), webhook delivery attempts (`webhook_deliveries`), and message delivery status (`message_state_events`) are logged in their own domain-specific append-only tables, not duplicated into `audit_logs` - keeping the human-facing audit trail signal-dense rather than flooded with system-routine events.

### 8.3 Integrity

- `audit_logs` is append-only, enforced at the database-role level (`DATABASE.md` Section 21's `REVOKE UPDATE, DELETE` on the application role) - not just an application-code convention.
- Every audit log entry captures `actor_type` explicitly (user/system/rule/api_key) so an entry's provenance is unambiguous even years later.
- **Access to audit logs is itself audited**: a workspace admin viewing the audit log UI, or platform staff querying `audit_logs` directly, generates its own log entry - a second-order but deliberate control, since audit-log confidentiality (who was looking at whom) matters in some enterprise/compliance contexts.

### 8.4 Retention & Access

- Audit logs are retained for a minimum of 12 months (longer for Enterprise-tier customers with compliance requirements, per `DATABASE.md` Section 13's archiving tiers applied specifically to this table) - explicitly **not** subject to the same soft-delete-then-90-day-purge cycle as regular user data (Section 7.3), since an audit trail that a user could trigger the deletion of via a data-erasure request would defeat its purpose. Personal data *within* an audit log entry (e.g. an actor's email in metadata) is still subject to GDPR minimization principles (Section 7.1) - the log entry's existence and the action it records persist; unnecessary embedded PII does not.
- Workspace admins can view their own workspace's audit log (`API.md` Section 10 - Business tier). Platform staff access is scoped and logged per Section 8.3.

---

## 9. Application & Connector Security

### 9.1 Input Validation & Injection Prevention

- All API input validated against explicit schemas (class-validator/zod at the NestJS layer, matching `ARCHITECTURE.md`'s tech stack) before touching any query - Prisma's parameterized queries (ADR-0002) close the standard SQL injection path structurally, not just by convention.
- Rule `jsonb` payloads (`DATABASE.md` Section 6.12) are validated against the versioned JSON Schema referenced in the future `AUTOMATION_ENGINE.md` before persistence - a malformed or malicious rule payload is rejected at the API boundary, never partially trusted downstream.

### 9.2 OWASP Top 10 - Specific Application

| Risk | Mitigation |
|---|---|
| Broken access control | Workspace-scoping + role checks on every mutating request (`API.md` Section 7.2); RLS as defense-in-depth once enabled (`DATABASE.md` Section 10) |
| Cryptographic failures | Argon2id passwords, TLS everywhere (Section 6), no secrets in the primary datastore (Section 5) |
| Injection | Parameterized queries via Prisma, schema-validated input (Section 9.1) |
| Insecure design | This document + `API.md`'s lifecycle rules + ADR discipline - security is a design input, not a post-hoc audit |
| Security misconfiguration | Infrastructure-as-code (Terraform, `ARCHITECTURE.md` Section 8) - no manual console changes, config drift is reviewable in PRs |
| Vulnerable/outdated components | Automated dependency scanning in CI (Section 12), Dependabot/Renovate-style automated update PRs |
| Identification/auth failures | Section 4 in full |
| Software/data integrity failures | Signed container images, CI provenance (Section 12), webhook HMAC signing (Section 9.4) |
| Logging/monitoring failures | Section 8 (audit logs) + `ARCHITECTURE.md`'s OTel/Prometheus/Loki stack |
| Server-side request forgery (SSRF) | Relevant specifically to connector webhook URLs (`API.md` Section 14.2) - outbound webhook targets are validated against a deny-list of internal/private IP ranges before delivery, closing the "register a webhook pointing at our own internal metadata endpoint" attack |

### 9.3 Inbound Webhook Verification (Provider → Platform)

Every provider webhook (Telegram, Discord, Slack) is verified via that provider's own signature/secret mechanism before its payload is trusted (e.g. Slack's signing secret, Telegram's secret token) - a connector worker that skips this check is a Connector SDK conformance failure (ADR-0004), not an acceptable shortcut, and the mock connector used to validate the SDK (ROADMAP.md Phase 4) includes a deliberately-invalid-signature test case specifically to catch this class of bug before a real connector ships.

### 9.4 Outbound Webhook Signing (Platform → Third Party)

Per `API.md` Section 14.2: HMAC-SHA256 signing of every outbound webhook payload, secret shown once at creation (matching Section 5's API-key pattern), documented verification process for receivers. This protects third-party integrations from accepting forged events claiming to originate from Smart Message Center.

### 9.5 Third-Party Connector Isolation (Phase 18 forward-looking, designed now)

Since ADR-0004 commits to a Connector SDK that will eventually accept third-party-authored connectors (Phase 18 marketplace), the SDK's execution model must assume a connector implementation could be buggy or malicious:
- Third-party connectors run in a sandboxed/isolated execution context (separate process/container, not in-process with core platform code) - never granted direct database access, only the canonical event-ingestion API (`API.md` Section 14.3).
- A third-party connector's credentials (Section 5) are scoped to exactly the LinkedAccount it serves - never platform-wide secrets access.
- Marketplace connectors go through a review process before publication (details belong in a future Phase 18 document, flagged here so it isn't forgotten: this is a security gate, not just a quality one).

---

## 10. Infrastructure Security

- **Network segmentation**: connector workers, the core API, and the database sit in distinct security-group/subnet boundaries (`ARCHITECTURE.md` Section 7); a compromised connector worker cannot directly reach the database - it goes through the same API/event-bus boundary any other client would.
- **Least-privilege IAM**: every service (API, each connector worker type, CI/CD) has its own IAM role scoped to exactly what it needs - no shared "backend" role with broad permissions. Connector workers specifically only have secrets-manager read access for their own provider's credential namespace, not all credentials.
- **CI/CD secrets**: GitHub Actions authenticates to AWS via OIDC (`ARCHITECTURE.md` Section 9), not long-lived static credentials stored in CI - eliminates an entire class of "leaked CI secret" incident.
- **Container security**: minimal base images, no root execution in containers, image scanning in CI (Section 12) before any image reaches the registry that Kubernetes deploys from.
- **Admin/ops access**: no direct production database access for routine work - the `smc_readonly` role (`DATABASE.md` Section 21) is the default for any human inspection need; write access to production requires a break-glass, logged, time-boxed process.

---

## 11. Incident Response

- **Detection**: OTel/Prometheus/Loki (`ARCHITECTURE.md` Section 7) alerting on anomalous patterns (auth failure spikes, unusual data-export volume, secrets-manager access anomalies) feeds a defined on-call escalation path.
- **Response**: a documented severity classification (data breach vs. availability incident vs. isolated bug) with different response timelines and disclosure obligations - the GDPR-specific breach path (Section 7.5) is one branch of this, not the whole process.
- **Disclosure**: a `security.txt` (RFC 9116) and a documented responsible-disclosure policy are Phase 2-era deliverables (before public launch, per ROADMAP.md's Phase 1-2 timing) - external researchers need a sanctioned path to report issues before the product has a large enough surface area for this to matter in practice.
- **Post-incident**: every real incident produces a blameless post-mortem, filed as a project artifact (not into this document, which stays a policy document, not an incident log).

---

## 12. Vulnerability Management & Security Testing in CI/CD

- **Dependency scanning**: automated (Dependabot/Renovate + `npm audit`-equivalent) on every PR and on a recurring schedule - a vulnerable dependency is a CI-visible finding, not something discovered manually.
- **SAST**: static analysis integrated into the CI pipeline (`ARCHITECTURE.md` Section 9's existing lint/typecheck/build stages gain a security-scanning stage) - flags common vulnerability patterns before merge.
- **Container/image scanning**: as noted in Section 10, before any image is deployable.
- **Periodic penetration testing**: not an MVP-day-one line item, but scheduled to occur before the product handles real payment data at scale and before any Enterprise-tier sales motion begins (Phase 17 alignment) - flagged here so it's budgeted for, not forgotten.
- **`/code-review security-review` (or equivalent) as a standing practice**: security-focused review is run against nontrivial changes to auth, credential handling, and connector code specifically - not just general code review, given how disproportionately those areas matter to this product's threat model.

---

## 13. Explicitly Rejected Approaches (and why)

Mirrors PRODUCT.md's "Things We Will Never Build" discipline, applied to security specifically:

- **No unofficial/reverse-engineered provider integration methods** (already covered by ADR-0010 for Telegram specifically) - restated here as a general security policy: an unofficial integration method is also, almost by definition, a larger and less-audited attack surface than an official API, independent of the ToS argument already made elsewhere.
- **No storing connector credentials in the primary database, ever**, even "temporarily" or "for debugging" - Section 5 is a hard boundary, not a default that can be exception'd for convenience.
- **No client-side-only security controls** (e.g. relying on a mobile app to enforce a permission check) - every control enforced client-side is re-enforced server-side; client-side checks are UX conveniences only, never the actual security boundary.
- **No "trust by default" for third-party connectors** (Section 9.5) - Phase 18's marketplace does not get a lighter security bar than first-party connectors just because it arrives later; if anything, the bar is higher given the reduced code-review trust relationship.
- **No security-by-obscurity as a stated control** (e.g. "the admin endpoint isn't documented so it's fine") - every endpoint in `API.md` is assumed discoverable; security rests on Section 4's authentication and Section 4.4's separate admin tier, not on secrecy of the URL.

---

## Coverage Map

| Requirement (from ROADMAP.md's SECURITY.md description) | Section |
|---|---|
| Threat model | 2 |
| Credential storage | 5 |
| Secrets management | 5, 10 |
| Audit logging spec | 8 |
| GDPR data handling | 7 |
