# 4.14.8 - Remove the background-save toast

After a device accepts an enabled Sleep Mode or Smart Schedule window, the app no longer displays "Saved on the device, not in the background" when the relay does not confirm it. The shared policy also covers replayed Smart Schedule saves. Sleep Mode returns to Device Settings after saving the local settings. Relay requests and their acknowledgement values remain unchanged; this UI change does not make an unconfirmed background schedule active.

The separate "Background schedule may still run" warning and retry behavior for an unconfirmed stop remain. Device-write errors and offline queue notices also retain their existing behavior.

Validation covers the shared toast policy and an isolated Sleep Mode save flow that receives a relay refusal while enabling. The existing stop-fail-retry E2E remains in place. This is a client-only release; no relay deployment is needed.
