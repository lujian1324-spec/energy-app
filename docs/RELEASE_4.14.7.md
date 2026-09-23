# 4.14.7 - Hide PV-family alarms from Notifications

## Scope

- Hide active PV, solar, photovoltaic and MPPT alarms from the Notifications list and its shared unread counts. Match codes and raw English or Chinese names, including numbered PV inputs and known uppercase codes.
- Do not send those alarms through the foreground device-alarm or power-outage notification paths.
- Do not treat a PV-related alarm record as a grid outage in the background relay. Actual grid outage fields and independent grid alarms still work.
- Solar charging started/stopped are status events, not alarm records, and remain enabled by the existing Solar Status preference.

## Verification and release

Run `npm run test:unit`, `npm run test:server` and `npm run build` before merging. Deploy the relay code only after the matching commit passes tests on the EC2 Node runtime. Back up the private runtime store but do not replace it during deployment or rollback. Device-level notification delivery and Store distribution still require post-release confirmation.
