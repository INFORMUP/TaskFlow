# Invitation email delivery

**Goal:** Send an actual email when an invitation is created or resent, so invitees don't need the admin to hand them the link out-of-band.

## Why

The invitation tracking work (see `backend/src/routes/invitations.ts`) landed without an email layer. Today:

- `POST /api/v1/organizations/:id/invitations` returns the raw token in the response; the admin UI shows a copyable `/accept-invite?token=...` link exactly once.
- Google login (`backend/src/routes/auth.ts` → `claimPendingInvitationsForUser`) auto-accepts any pending invite whose email matches the caller's Google email on sign-in. So an invited user can just "Sign in with Google" and land in the org without ever opening the invite link.

That gets us a working invite flow, but:

1. Admins still have to paste the link somewhere (Slack, email, chat) for invitees who haven't signed in yet.
2. An invite that an admin forgets to share is indistinguishable from one the user simply ignored — the "pending" status on the invitations page is misleading.

Adding email makes "invitation sent" mean what the UI already claims.

## Provider choice

**Decision: Nodemailer + SMTP via Mailgun**, mirroring Reportal's setup.

Why:

- Reportal (`reportal/backend/src/services/emailService.js`) already uses Nodemailer over Mailgun SMTP. The sending subdomain `mg.informup.org` is verified in Route53 (DKIM/SPF/DMARC live), and the Mailgun account is paid for and warmed up. TaskFlow gets to ride on that with zero DNS or provider-account work.
- AWS SES was considered and rejected for the first cut: the InformUp AWS account has never touched SES (no IAM permissions, no verified identities), so going SES-native means a sandbox-exit support ticket + fresh domain verification. That's the setup cost the repo avoids by reusing Mailgun.
- Resend was considered and rejected for consistency: two email providers across Reportal and TaskFlow is operational overhead for no real benefit at this volume.

The mailer abstraction below is small enough that swapping to SES later is a one-file change if volume ever justifies it.

## AWS / Mailgun setup

Before writing code:

1. In the Mailgun dashboard, mint a **new SMTP credential** scoped to TaskFlow — e.g. user `taskflow@mg.informup.org` with its own password. Keep it separate from Reportal's so either can be rotated without affecting the other.
2. Store the creds in SSM Parameter Store, mirroring Reportal's layout (`scripts/taskflow/put-ssm-secret.sh` handles this):

   ```
   /taskflow/staging/SMTP_HOST   = smtp.mailgun.org
   /taskflow/staging/SMTP_PORT   = 587
   /taskflow/staging/SMTP_USER   = taskflow@mg.informup.org
   /taskflow/staging/SMTP_PASS   = (SecureString)
   /taskflow/staging/SMTP_FROM   = TaskFlow <taskflow@informup.org>
   /taskflow/staging/INVITE_ACCEPT_BASE_URL = https://taskflow.staging.informup.org/accept-invite
   ```

   Same for `/taskflow/production/*` with the prod `INVITE_ACCEPT_BASE_URL`.
3. Wire the five SMTP keys + `INVITE_ACCEPT_BASE_URL` into each EB environment's env vars. No IAM changes needed — the EB instance profile doesn't need SES permissions; Nodemailer authenticates to Mailgun with username+password over TLS on 587.

## What to build

### 1. Config

Add to `backend/src/config.ts`:

```ts
smtpHost: process.env.SMTP_HOST ?? "",
smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
smtpUser: process.env.SMTP_USER ?? "",
smtpPass: process.env.SMTP_PASS ?? "",
smtpFrom: process.env.SMTP_FROM ?? "TaskFlow <no-reply@taskflow.local>",
inviteAcceptBaseUrl: process.env.INVITE_ACCEPT_BASE_URL ?? "http://localhost:5173/accept-invite",
```

Update `.env.example` (if present) with the same keys.

Do **not** make the server fail to boot when `SMTP_HOST` (or any SMTP key) is empty — the mailer should no-op and log instead (see §3). Dev and CI must keep working without SMTP creds.

### 2. `backend/src/services/mailer.service.ts`

New file. Exposes one function:

```ts
export interface InviteEmailInput {
  to: string;
  orgName: string;
  inviterName: string | null;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<void>;
```

Behavior (modeled on Reportal's `emailService.js`):

- Lazy-init a Nodemailer transporter from `config.smtpHost`/`smtpPort`/`smtpUser`/`smtpPass`. Use `secure: true` when port is 465, else STARTTLS on 587.
- If any of host/user/pass is empty: `console.log` the rendered email (subject + body + link) and return. This keeps dev + tests silent-but-useful.
- If configured: `transporter.sendMail({ from: config.smtpFrom, to, subject, html })`. Catch errors and log — do **not** let a mail failure fail the HTTP request that triggered it. The invitation row is the source of truth; a mail failure should be visible (via logs / a future "resend" button) but not break invite creation.
- Template is a minimal HTML (plaintext fallback optional). Include org name, inviter name, role, accept URL, expiry. Short, transactional, no marketing. Reportal's `wrapHtml` is a reasonable reference for styling, but don't share code across repos — copy the shape, not the module.

### 3. Hook points in `routes/invitations.ts`

Two call sites:

- `POST /api/v1/organizations/:id/invitations` — after `prisma.invitation.create`, before the 201 response.
- `POST /api/v1/organizations/:id/invitations/:inviteId/resend` — after `prisma.invitation.update`, before the 200 response.

In both cases the route already has the plaintext token and needs the org name + inviter display name. Load both via Prisma (one extra query each; fine for the volume).

Fire the send **after** a successful response commit, or `await` it and swallow errors — whichever matches the project's logging conventions. Never roll back the invitation on a send failure.

Keep the response shape the same (`token` still included). The frontend can drop the "copy this link" UI once email works, but leaving it for now is belt-and-suspenders — operators occasionally need the link for debugging.

### 4. Tests

- Unit test `sendInviteEmail` with SMTP config unset — assert it logs and resolves.
- Unit test with SMTP config set — mock the Nodemailer transporter and assert the `sendMail` payload shape (to / from / subject / html).
- Integration test that `POST /invitations` still returns 201 when the mailer throws (hook the mailer to throw, assert no regression).

No need to integration-test actual delivery. That's a manual smoke check on staging.

### 5. Frontend

Once email works reliably:

- The one-time invite-link box in `OrganizationView.vue` can become opt-in ("Show link" toggle) rather than always-visible. Admins will mostly rely on the email.
- Add a minimal `AcceptInviteView.vue` at `/accept-invite?token=...` that calls `acceptInvitation(token)` and redirects to `/` on success. Currently the link has no landing page — it relies on the user already being signed in when they click it. That's a rough edge worth closing when email ships (invitees will click from their inbox, probably while signed out).

Not needed before email lands, but part of the same "invitee experience" arc.

## Out of scope

- Bounce / complaint handling — Mailgun webhooks, suppression lists, etc. Defer until we see real bounces.
- Per-org "from" addresses — every email comes from the single configured `SMTP_FROM`.
- Localization — English only.
- Rate-limiting mail sends. The invitation endpoints are already behind the org's rate limit and only owners/admins can hit them, so spam risk is bounded.

## Sequencing

1. Mint the TaskFlow Mailgun SMTP credential; write the SSM params (staging + prod).
2. Config + mailer service (no-op mode).
3. Wire into create + resend routes.
4. Push the SMTP env vars onto staging EB; manually confirm an invite email lands.
5. Frontend AcceptInviteView + toggle the link display.
6. Production rollout (SSM + EB env on prod).

Each step is independently shippable.
