# Phase 1 Quickstart

This is the end-to-end verification path for Phase 1. It exercises every
significant code path on a real device against a real Twilio Verify
service, in less than 10 minutes from a clean Phase 0 baseline. Running
through it is what closes the Phase 1 acceptance criteria — every
success criterion in `spec.md` is touched at least once.

The same path will live in the project `README.md` once Phase 1 lands;
this document is the spec-side reference.

---

## Prerequisites (verify first)

These should already be installed and configured on the contributor's
machine. They are not counted against the Phase 1 verification budget.

- A working Phase 0 boot path (`docker compose -f docker-compose.dev.yml up`
  serves a healthy `GET /api/v1/health`).
- A real mobile device (iOS 15+ or Android API 24+) with the Expo Go
  app installed and on the same Wi-Fi network as the development host
  (or a USB-connected dev build).
- A SIM card whose phone number can receive SMS in Egypt — needed to
  verify the OTP flow on real hardware.
- A Twilio account with a Verify Service provisioned. The Account SID,
  Auth Token, and Verify Service SID need to be present in
  `backend/.env` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_VERIFY_SERVICE_SID`).
- An RS256 keypair generated and present in `backend/.env`
  (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, base64-encoded). See research
  R3 for the generation command.

---

## Step 1 — Boot the backend with Phase 1 env (~30 s)

```bash
docker compose -f docker-compose.dev.yml up backend
```

Expected: backend logs show `AuthModule`, `UsersModule`, and
`TwilioModule` registered. The Swagger UI at
http://localhost:3000/api/v1/docs lists the ten Phase 1 endpoints
documented in `contracts/auth.openapi.yaml`. The Phase 0 daily cleanup
job announces itself in the logs (no rows yet).

---

## Step 2 — Boot the Expo dev client (~30 s)

```bash
cd mobile
npx expo start
```

Scan the QR code from the device. The app boots into the welcome
screen. **Verify Constitution Principle I**: with the device locale set
to English the welcome screen renders in English and reads
left-to-right; setting the device locale to Arabic and reopening renders
the same screen in Arabic with right-to-left layout. (SC-011 spot
check.)

---

## Step 3 — Register a customer with phone-OTP (~90 s, SC-001)

On the device:

1. Tap **"Create account"**.
2. Enter your phone in E.164 format (e.g., `+201234567890`).
3. Tap **"Send code"**. Within seconds the SMS arrives (`POST
   /auth/send-otp` returns 204).
4. Enter the code on the OTP screen, plus full name, password (≥ 8
   characters; SC-014), and birthdate.
5. Tap **"Register"**. The platform calls `POST /auth/register`,
   verifies the OTP through Twilio, hashes the password with bcrypt,
   inserts the `User` row, and returns a session pair. The app stores
   the refresh credential in Expo SecureStore and the access credential
   in `AuthContext` memory.
6. The app routes to the (empty) customer home tab.

**Expected backend log lines** (R10 / FR-020): one
`{"event":"otp.send","outcome":"success"}` followed by one
`{"event":"otp.verify","outcome":"success"}` followed by no
explicit registration event (registration is the entry point; the OTP
verify already covers it). Each line carries a `correlationId`.

---

## Step 4 — Sign out, sign back in (~15 s, SC-002)

1. From the (placeholder) profile screen, tap **"Sign out"**.
2. The app calls `POST /auth/sign-out` with the current refresh
   credential. The platform inserts an `InvalidatedToken` row keyed by
   that credential's `jti` (FR-009).
3. The welcome screen reappears; `AuthContext` is empty.
4. Tap **"Sign in"**, enter the same phone and password, tap submit.
5. The platform calls `POST /auth/sign-in`, returns a fresh session
   pair, and the app routes to the customer home.

**Expected backend log lines**: one `auth.sign_out outcome=success`
during step 2; one `auth.sign_in outcome=success` during step 5.

---

## Step 5 — Force a refresh exchange (SC-003, SC-004)

While signed in:

1. Wait for the access credential to expire (default 15 min — research
   R4) **or** edit `JWT_ACCESS_TTL=10s` for this session and restart
   the backend.
2. From the app, perform any authenticated action (e.g., reopen the
   profile screen).
3. The Axios interceptor in `services/api.ts` observes the 401, fires
   exactly one `POST /auth/refresh`, and retries the original request
   with the new access credential. The customer never sees an error.

**Verify single-flight (SC-005)**: While the access credential is
expired, fire five parallel authenticated requests by tapping the
"Refresh" button on the profile screen rapidly, or by running a small
script that issues five `GET /auth/me` requests with the *same* expired
access credential. Backend log shows exactly one `auth.refresh
outcome=success` line for that burst, and four "expired access
credential" 401s on the original requests followed by their successful
retries.

---

## Step 6 — Replay the old refresh credential (SC-004)

> **Local debugging only.**  This step uses a dev-only test hook that
> must NOT be enabled in production.

If the backend is running with `DEV_MODE=true`, issue a short-lived test
refresh credential for the customer you created in Step 3:

```bash
curl -X POST http://localhost:3000/api/v1/auth/test/issue-refresh \
  -H "Content-Type: application/json" \
  -d '{"userId":"<customer-id-from-step-3>"}'
```

Save the returned `refreshToken`.  After the normal refresh exchange in
Step 5 completes, present that saved credential to `POST /auth/refresh`:

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<the saved test credential>"}'
```

Expected response: `401 { "code": "AUTH_REFRESH_REUSED", ... }`.
Backend log: `auth.refresh outcome=rotated_replay`.

If `DEV_MODE` is not set, obtain the pre-rotation credential from the
mobile client's in-memory state via the React Native debugger (never via
`adb logcat` in production builds).

---

## Step 7 — Verify the rate-limit guards (SC-007, SC-015)

In a terminal, fire four `POST /auth/send-otp` requests within 60
seconds:

```bash
for i in 1 2 3 4; do
  curl -i -X POST http://localhost:3000/api/v1/auth/send-otp \
    -H "Content-Type: application/json" \
    -d '{"phone":"+201234567890"}'
done
```

Expected: the first three return `204`. The fourth returns `429
AUTH_RATE_LIMITED` with a `Retry-After` header (FR-016, SC-007). No
fourth SMS is sent — verify in the Twilio console.

Then fire eleven `POST /auth/sign-in` requests with a deliberately wrong
password:

```bash
for i in $(seq 1 11); do
  curl -i -X POST http://localhost:3000/api/v1/auth/sign-in \
    -H "Content-Type: application/json" \
    -d '{"phone":"+201234567890","password":"wrong-password"}'
done
```

Expected: the first ten return `401 AUTH_INVALID_CREDENTIALS`. The
eleventh returns `429 AUTH_RATE_LIMITED` with a `Retry-After` header
(FR-016a, SC-015).

---

## Step 8 — Verify the soft-deleted-account refusal (SC-008)

In the database, manually mark the test account as soft-deleted:

```sql
UPDATE "User" SET "deletedAt" = NOW() WHERE phone = '+201234567890';
```

Attempt to sign in with the same credentials. Expected: `401
AUTH_INVALID_CREDENTIALS` (the soft-delete is invisible — `prismaService.extended.user.findUnique`
returns `null` because of the default-filter, so the platform reports
the same generic credentials error per FR-017). Backend log:
`auth.sign_in outcome=unknown_phone` (the spec-mandated internal
distinction; the externally visible response is unchanged).

Restore the row when done:

```sql
UPDATE "User" SET "deletedAt" = NULL WHERE phone = '+201234567890';
```

---

## Step 9 — Verify the change-phone OTP flow (SC-009)

While signed in:

1. From the profile screen, tap **"Change phone number"**.
2. Enter a *new* phone number (a second SIM you can receive SMS on).
3. Tap **"Send code"**. The platform calls `POST
   /users/me/change-phone/start`, which dispatches an OTP to the new
   number. The current account's `phone` field is **not** updated.
4. Confirm: query the database — `User.phone` is still the old number.
5. Enter the code on the verify screen and tap submit. The platform
   calls `POST /users/me/change-phone/verify`. On success the `phone`
   field is updated.
6. Try to change phone to a number already attached to another account
   (register a second account on a third SIM if needed). Expected:
   `409 PHONE_IN_USE` *before* any SMS is sent (the start endpoint
   pre-checks the uniqueness constraint).

---

## Step 10 — Verify the daily cleanup job

Trigger the cleanup manually (or wait until the next 02:00 server time)
and observe the backend log line:

```text
[InvalidatedTokenCleanupJob] cleanup: removed 0 expired rows
```

The count should match the number of `InvalidatedToken` rows whose
`expiresAt` lies before `now()`. If you ran step 6, you should have at
least one row in the table; once its `expiresAt` lapses (default 30
days), the next cleanup pass removes it.

---

## Step 11 — Spot-check FR-019 (request-shape validation)

Per FR-019 / SC-010, every body-accepting endpoint must reject extra
fields. Pick three endpoints and add a junk field:

```bash
# /auth/register with junk field
curl -i -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test","phone":"+201234567890","password":"password","birthdate":"1990-01-01","otpCode":"123456","junk":"x"}'
```

Expected: `400 VALIDATION_ERROR` naming the unexpected `junk` field.
Verify against `/auth/sign-in` and `/users/me` similarly. This closes
the Phase 0 SC-006 deferred verification.

---

## Closing checklist

- [ ] Welcome / sign-in / register / verify-OTP screens render correctly in both English and Arabic with proper RTL layout (SC-011).
- [ ] Registration completes on a real device under 90 seconds (SC-001).
- [ ] Sign-in completes on a real device under 15 seconds (SC-002).
- [ ] Refresh credential rotation rejects replay (SC-004); single-flight produces exactly one refresh exchange under N=5 parallel 401s (SC-005).
- [ ] Phone already in use is refused (SC-006); send-OTP rate limit trips at the fourth request (SC-007); sign-in rate limit trips at the eleventh (SC-015).
- [ ] Soft-deleted account sign-in is refused with the generic credentials error (SC-008, SC-012).
- [ ] Phone change is not committed without OTP verification on the new number (SC-009).
- [ ] Three body-accepting endpoints refuse one extra field each (SC-010).
- [ ] Password shorter than 8 is refused; an 8-character password is accepted (SC-014).
- [ ] Each significant auth event emits exactly one structured log line carrying the named fields, and no log line contains the plaintext password or OTP code (SC-016).
- [ ] An unauthenticated request to `GET /auth/me` returns `401` with a clear unauthenticated error (SC-013).
