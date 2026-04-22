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

Two options worth considering; pick one before starting work.

- **Resend** (recommended). Simple HTTP API, native React/Vue template support isn't needed (we're sending plaintext + a simple HTML), cheap for the volume TaskFlow will see, has a free tier sufficient for dev/staging. One API key.
- **Nodemailer + SMTP**. Vendor-neutral; works with any SMTP provider (including Gmail, SES, Postmark). More config knobs (host, port, auth, TLS). Good if the org already has an SMTP relay.

Avoid AWS SES unless there's an existing IAM footprint — sandbox lift, domain verification, and bounce handling aren't worth it for a first cut.

**Recommendation:** Resend. It's the cleanest path and the abstraction boundary below is small enough that swapping to SMTP later is one file.

## What to build

### 1. Config

Add to `backend/src/config.ts`:

```ts
resendApiKey: process.env.RESEND_API_KEY ?? "",
inviteEmailFrom: process.env.INVITE_EMAIL_FROM ?? "TaskFlow <no-reply@taskflow.local>",
inviteAcceptBaseUrl: process.env.INVITE_ACCEPT_BASE_URL ?? "http://localhost:5173/accept-invite",
```

Update `.env.example` (if present) with the same keys.

Do **not** make the server fail to boot when `RESEND_API_KEY` is empty — the mailer should no-op and log instead (see §3). Dev and CI must keep working without an API key.

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

Behavior:

- If `config.resendApiKey` is empty: `console.log` the rendered email (subject + body + link) and return. This keeps dev + tests silent-but-useful.
- If set: POST to Resend (or construct via `resend` SDK if we take the dep). Catch network errors and log — do **not** let a mail failure fail the HTTP request that triggered it. The invitation row is the source of truth; a mail failure should be visible (via logs / a future "resend" button) but not break invite creation.
- Template is plaintext + a minimal HTML. Include org name, inviter name, role, accept URL, expiry. Short, transactional, no marketing.

### 3. Hook points in `routes/invitations.ts`

Two call sites:

- `POST /api/v1/organizations/:id/invitations` — after `prisma.invitation.create`, before the 201 response.
- `POST /api/v1/organizations/:id/invitations/:inviteId/resend` — after `prisma.invitation.update`, before the 200 response.

In both cases the route already has the plaintext token and needs the org name + inviter display name. Load both via Prisma (one extra query each; fine for the volume).

Fire the send **after** a successful response commit, or `await` it and swallow errors — whichever matches the project's logging conventions. Never roll back the invitation on a send failure.

Keep the response shape the same (`token` still included). The frontend can drop the "copy this link" UI once email works, but leaving it for now is belt-and-suspenders — operators occasionally need the link for debugging.

### 4. Tests

- Unit test `sendInviteEmail` with `RESEND_API_KEY` unset — assert it logs and resolves.
- Unit test with the key set — mock `fetch` (or the SDK) and assert the payload shape.
- Integration test that `POST /invitations` still returns 201 when the mailer throws (hook the mailer to throw, assert no regression).

No need to integration-test actual delivery. That's a manual smoke check on staging.

### 5. Frontend

Once email works reliably:

- The one-time invite-link box in `OrganizationView.vue` can become opt-in ("Show link" toggle) rather than always-visible. Admins will mostly rely on the email.
- Add a minimal `AcceptInviteView.vue` at `/accept-invite?token=...` that calls `acceptInvitation(token)` and redirects to `/` on success. Currently the link has no landing page — it relies on the user already being signed in when they click it. That's a rough edge worth closing when email ships (invitees will click from their inbox, probably while signed out).

Not needed before email lands, but part of the same "invitee experience" arc.

## Out of scope

- Bounce / complaint handling — Resend webhooks, suppression lists, etc. Defer until we see real bounces.
- Per-org "from" addresses — every email comes from the single configured `INVITE_EMAIL_FROM`.
- Localization — English only.
- Rate-limiting mail sends. The invitation endpoints are already behind the org's rate limit and only owners/admins can hit them, so spam risk is bounded.

## Sequencing

1. Config + mailer service (no-op mode).
2. Wire into create + resend routes.
3. Add Resend (or SMTP) credentials to staging; manually confirm an invite email lands.
4. Frontend AcceptInviteView + toggle the link display.
5. Production rollout.

Each step is independently shippable.
