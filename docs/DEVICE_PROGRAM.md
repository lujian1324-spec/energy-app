# Device program — Smart Schedule, Charging Settings, Silent Mode, Charge & Discharge Limits

Built in v4.22.0. This is the backend / firmware handoff: the data model, the relay API,
how the schedule is executed with the app closed, and what still needs the firmware team.

| Feature | App | Relay (runs with the app closed) | Device register |
|---|---|---|---|
| Smart Schedule — AC Output on/off | `/device/:id/schedule`, tab AC Output | writes at the task time | **0x0080** `0x01AA` on / `0xAA01` off |
| Smart Schedule — start / stop charging | same screen, tab Charging | writes on each change | **0x0085** (0 W = stopped) |
| Charging Settings — AC charging power | `/device/:id/charging` | writes on each change | **0x0085** |
| Silent Mode (switch + schedule) | `/device/:id/charging/silent` | writes at window start / end | **0x0085** capped |
| Charge & Discharge Limits | `/device/:id/limits` (**hidden**, `CHARGE_LIMITS_ENABLED`) | stored only | **none yet — firmware** |

One implementation of the rules, `server/deviceProgram.js`, is used by both the relay and
the app (the app imports it through `server/deviceProgram.d.ts`), so the two can never
disagree about what the device should be doing.

## 1. Data model (one per device)

```jsonc
{
  "version": 1,
  "model": "Sierro 1000",            // or "Sierro 2000"
  "tz": "America/Los_Angeles",       // IANA zone of the phone at save; every time is read in it
  "chargePowerW": 400,               // Sierro 1000: 50|100|150|200|300|400 · Sierro 2000: 100|200|300|400|600|800
  "silent": {
    "enabled": true,                 // the Silent Mode switch
    "scheduled": true,               // "Scheduled Silent Mode": limit only inside from–to
    "from": "20:00", "to": "09:00",  // to <= from ⇒ ends the next day
    "days": [0,1,2,3,4,5,6],         // days a window STARTS on (0 = Sunday)
    "updatedAt": 1790317800000
  },
  "tasks": [                         // at most 20
    { "id": "t1", "kind": "charge", "action": "stop",  "time": "07:00", "days": [1,2,3,4,5], "enabled": true, "updatedAt": 1790317800000 },
    { "id": "t2", "kind": "ac",     "action": "off",   "time": "22:00", "days": [0,1,2,3,4,5,6], "enabled": true, "updatedAt": 1790317800000 }
  ],
  "limits": { "chargeMax": 100, "dischargeMin": 0 },   // 100|80|60 and 0|10|20 (%)
  "savedAt": 1790317800000
}
```

Validation (`validateProgram`) refuses: an unknown zone, a power that is not one of the
model's choices, `HH:MM` that is not 24-hour, a task with no days, duplicate task ids,
more than 20 tasks, an empty Silent window, and two enabled tasks of the same kind at the
same time on a shared day (start and stop at once).

## 2. Rules

- **Tasks are point events.** A task fires at its time on each of its days, in `tz`, and
  only at occurrences **after it was last saved** (`updatedAt`): creating "Stop Charging
  7:00 AM" at 10:00 does not stop charging until tomorrow.
- **Charging** is paused or running by the latest charge event in effect. With none (no
  charge tasks, or all deleted / off) charging runs.
- **AC output** events are applied once, at their time. One missed for more than 30 min
  (`AC_EVENT_GRACE_MS`: relay down, device offline) is dropped, not replayed hours later.
- **Silent Mode**: off → no limit; on and not scheduled → limit all the time; on and
  scheduled → limit inside the window (switching it on inside a window applies at once).
  Limit = 150 W (Sierro 1000) / 300 W (Sierro 2000). It is a **cap**: a power the user
  picks at or under it — also during a window — is their setting and stays after the
  window ends; choices above it are unavailable while it limits.
- **0x0085 value** = 0 while charging is paused, else `chargePowerW`, capped while Silent
  Mode limits. **Changing the power never starts a paused charge** (it writes 0 again).

## 3. Relay API (`server/programRoutes.js`)

Both calls authenticate the caller's own `IOT-Token` on every request and check that the
device is bound to that account (`/device/list`), then read or write.

| Call | Body / query | Reply |
|---|---|---|
| `POST /program` | `{ userId, deviceId, program, accessToken?, refreshToken?, accessExpiresAt? }` | `{ code: 0 }`; `400` invalid program (message says why); `401` no token; `403` other account / device; `409 POLLER_SESSION_REQUIRED` a timed program with no background session; `503` retry |
| `GET /program` | `?userId=&deviceId=` | `{ code: 0, data: { program \| null } }` |

The optional token pair is the same one-time background-session bootstrap `/schedule`
takes. Saving a program **removes that device's legacy Sleep / Smart Schedule window**
(`store.setUserProgram`): both drive 0x0085, so only one may exist.

`GET /debug/user/:userId` (X-Internal-Key) lists each device's program, the watts it implies
now (`wattsNow`) and what the tick last applied (`lastApplied: { chargeKey, acKey }`).

## 4. Execution (`server/programExecutor.js`)

Every tick (EventBridge → Lambda → signed `/internal/sleep/tick` each minute; or an
in-process minute timer when `SLEEP_SCHEDULER_EXTERNAL` is not `true`):

1. for each stored program compute `chargeTarget` (0x0085 watts + a key that changes only
   when the decision does) and `acTarget` (the AC event still owed, if any);
2. equal to what was last applied → nothing (no session, no API call);
3. otherwise open the background session, check the device is this user's, **online** and
   **not mid firmware update**, then write — AC event first, then the charge power — and
   record the new key. A failed or skipped write leaves the key unchanged, so the next tick
   retries (an offline device gets its charge state as soon as it is back).

The app also writes the current 0x0085 value right after a save when the device is online,
so a change shows at once; offline, it leaves that to the relay.

**Deploy:** the relay must be redeployed (runbook in `AWS_RELAY_AND_PUSH.md` §7) for
`/program` and the tick to exist. Until then the app's saves are refused by the old relay
(404) and say so.

## 5. Needs the firmware team

- **Charge Limit / Discharge Limit** — there is no register for either. 0x0054 is the
  PV/battery-priority reserve, not a discharge cut-off. "Stop discharging at the limit with
  no AC input, including during a power outage" cannot come from the cloud: in an outage the
  home network is usually down too. Needed: the registers, range, step, and when charging /
  discharging resumes (e.g. restart charging below limit − 5 %). The screen, storage and
  upload are built and hidden behind `CHARGE_LIMITS_ENABLED`.
- **Volatile control registers** — 0x0080 and 0x0085 are lost on power-down (0x0085 returns
  to 400 W). After a reboot the relay only re-applies at the next decision change. A
  "device restarted" signal, or non-volatile equivalents, would let it re-assert at once.
- **On-device schedules** — the relay needs the cloud and the home network. If the firmware
  can hold the task list itself, the same data model (§1) can be sent to it.
