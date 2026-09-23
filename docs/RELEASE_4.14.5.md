# Release 4.14.5 (app metadata build 2906)

## Sleep Save Hotfix

The user reported `Could not save Sleep Mode` followed by `config contribute not exists`.
The 4.14.4 matcher accepted `attribute not exist`, but not the plural `exists` or
the reported `contribute` spelling. Six enable/disable regression cases failed
before this fix, reproducing an early return before the power write and relay.

- Accept `not exist` and `not exists` in the explicit missing-attribute matcher.
- Accept the reported `config contribute not exists` spelling only as a complete,
  narrowly matched config error, allowing case, whitespace and terminal punctuation.
- Apply the same behavior to Sleep Mode and Smart Schedule because they share the
  control service. Handle both returned business failures and thrown API errors.
- Preserve permission, authentication, offline, timeout and ambiguous-error guards.
- Never ignore a failed power write even if it contains the same error wording.
- Power tables, BLE, relay/server code, and offline queue behavior are unchanged.

This fixes the reproduced wording compatibility gap, not every possible failure to
save. Sleep Mode still requires an immediate successful power write; its offline
save behavior and cloud-update/draft isolation remain separate follow-up work.
Hardware save, readback and schedule-boundary acceptance remain pending.
