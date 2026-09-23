# Dedicated AWS Sleep Mode Service

## Execution

`EventBridge Scheduler -> Lambda -> signed relay /internal/sleep/tick -> IoT passthrough -> FC06 register 0x0085`

The dedicated minute timer is independent of notification polling and runs when
the app is closed. The existing relay remains the credential and execution bridge;
this is not a second copy of users' rotating refresh tokens. Its store and EC2
availability are still dependencies. Do not run two relay processes against the
same token file.

- Sleep Mode uses 150/400 W for Sierro 1000 and 300/800 W for Sierro 2000.
- Smart Schedule shares the same single per-account/device charge-window slot,
  with explicit in-window watts and 0 W outside. The last authenticated save wins.
- Each schedule carries an IANA timezone. Cross-midnight windows are supported.
- A successful API acknowledgement persists the phase-occurrence key atomically.
  It is not a measurement of physical power. Failed/offline writes retry using
  the CURRENT desired power, never a queue of obsolete commands.
- Cancellation is persisted under the execution lock, then normal power is
  restored after any in-flight scheduled command. Refresh failures retain the
  schedule, so it can still be cancelled or recovered after login.
- Invalid windows, invalid timezones, non-integer/out-of-range watts, other users'
  devices, missing sessions, unsigned/stale/replayed internal calls fail closed.
- The old push poller does not enforce schedules when `SLEEP_SCHEDULER_EXTERNAL=true`.

AWS Scheduler provides [60-second precision](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html),
not exact-to-the-second execution. Network latency, upstream outages, credential
expiry and offline devices can delay switching. This is not a hardware safety timer.

## Deployment

1. Run `node infra/sleep-scheduler/template.mjs`. The generated JSON includes the
   tested CommonJS Lambda code. The inline function uses the AWS SDK v3 included
   in the Node.js 22 Lambda runtime; no device credentials are supplied to Lambda.
2. Run cfn-lint and `aws cloudformation validate-template` against
   `infra/sleep-scheduler/template.generated.json`; inspect a change set and its
   pre-deployment validation events before execution.
3. Create stack `sierro-sleep-scheduler`, region `us-east-1`, with `RelayUrl`,
   `RelayRoleName`, and `ScheduleState=DISABLED`. Capabilities: `CAPABILITY_IAM`.
   Review scoped IAM, generated secret, encrypted DLQ, log retention and alarms.
4. Fetch the tested commit on EC2; run `node --test server/*.test.js` in an isolated
   candidate worktree on the host's Node 18 runtime. Run `relay-preflight.mjs`
   there for redacted counts only. It never refreshes tokens or writes power.
5. Run `sh infra/sleep-scheduler/relay-install.sh COMMIT SECRET_ARN` from the
   candidate. The instance role retrieves the generated HMAC key directly into
   a root-only file. The script preserves live token data and installs a separate
   systemd drop-in. Keep prior environment settings unchanged.
6. Invoke Lambda with `{"dryRun":true}`. Require success. This checks the real
   Lambda/Secrets Manager/CloudFront/HMAC/relay path WITHOUT refreshing device
   sessions or writing power. A dry run is not proof that device credentials work.
7. Publish the companion app (4.14.9+) which sends `IOT-Token` on every save.
   Legacy clients without that header can only bootstrap with their independent
   session; subsequent unauthenticated saves are deliberately rejected.
8. Update the stack to `ScheduleState=ENABLED`. Verify actual scheduled Lambda
   invocations, relay `sleepScheduler.lastTickAt`, execution counts and alarms.
   Never use a made-up production schedule as a smoke test.

## Operations And Recovery

- Health exposes only aggregate timer status, no accounts/tokens/device IDs.
- Logs contain aggregate counts. Alarm states cover Lambda errors, missing ticks
  and the 14-day DLQ. Alarm notification destinations are not configured by default.
- Keep `tokens.json` and backups private (0600, parent backup directory 0700).
  A corrupt store stops startup instead of silently erasing schedules.
- After login or reinstall, save the window once to confirm its server copy.
  Passwordless accounts whose independent-session provisioning fails still need
  a valid dedicated backend session; creating a timer cannot manufacture one.
- Disable the Scheduler before rollback. Restore only code/drop-in settings, not
  old token-store backups: refresh tokens rotate, so an old snapshot is unsafe.
- Rotate the HMAC secret by installing the new secret on relay immediately after
  changing Secrets Manager; Lambda reads its current value on every invocation.
- For larger fleets, move the single-process store/locks to a transactional
  database and partitioned queue. This deployment bounds concurrency to five users,
  budgets work per minute and reports deferred work instead of falsely claiming
  it executed. It is not an unlimited-scale scheduler.

## Verification

`npm run test:server`, `npm run test:unit`, `npm run typecheck`, `npm run build`.
The schedule-save Playwright tests use intercepted APIs, not real batteries.
Server tests cover ownership, credentials, cancellation ordering, cross-midnight
occurrences, stable phases in the repeated DST hour, 0 W, missed-cycle recovery,
offline retries, deadlines, HMAC replay/tampering and the signed Lambda request.
