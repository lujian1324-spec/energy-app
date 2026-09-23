# 4.14.6 - Schedule stop acknowledgement

## Changes

- A valid user's disable request is an idempotent success when the relay has no enabled schedule for that device. No credentials or user record are created. Enabling still requires a poller session; an existing enabled schedule without credentials is not falsely acknowledged as stopped.
- Schedule requests require a boolean `enabled`. Missing poller credentials have a stable `POLLER_SESSION_REQUIRED` reason.
- The app checks the relay's business acknowledgement, not just HTTP 200. It shows safe, actionable session/timeout/network errors and preserves a newer login bootstrap during an in-flight request.
- Sleep Mode stays on its editor after partial success so Save can be retried. Cloud polling cannot overwrite the open draft or a locally saved window.
- The real-device Smart Schedule row reads its per-device local window/owner, not the global editor preference. This is local status, not a hardware or relay readback.

## Evidence And Limits

The reported toast means the instantaneous power request was acknowledged but the background request failed. It does not prove physical power readback or identify the HTTP failure on that phone. Read-only production checks found a healthy relay and users without poller credentials, but did not identify the screenshot's account. The app now exposes the distinction for the next reproduction.

Regression tests cover absent/prefs-only sessions, strict disable, cross-device isolation, business errors, malformed HTTP 200 responses, bootstrap replacement, per-device status, and a mocked mobile/desktop save-fail-retry flow. Test requests do not control real devices.

Independent poller login may still fail for accounts whose password differs from the registration-derived password. This release does not share the app refresh token, guess/change customer passwords, add a durable Sleep retry queue, solve cross-install schedule ownership, or guarantee cancellation of a device command already in flight. Relay routes still need a separate authenticated ownership hardening migration.

## Deployment

Deploy the tested relay commit with a private runtime-store backup and code-only rollback. Do not restore stale rotating tokens over the live store. Existing 4.14.5 clients benefit from the idempotent-stop backend correction; the retry UI and detailed failure messages require 4.14.6.
