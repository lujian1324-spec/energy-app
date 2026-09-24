/**
 * Settings follow the account, not the phone (v4.17.1).
 *
 * Sign-out, then sign-in as someone else, used to open on the previous
 * account's Founding Member tag and number, push toggles and low-battery
 * threshold: they lived in one persisted `settings` per install. Sign-in now
 * swaps in the incoming account's own set (see switchSettingsAccount) and
 * re-reads the roster for the tag, so the tag is the roster's answer for THIS
 * address rather than whatever the last onboarding on this phone wrote.
 */
import { usePowerStationStore } from '../stores/powerStationStore'
import { foundingMemberNumber } from '../data/foundingMembers'

/** Set the badge from the roster for this address: on for a member, off otherwise. */
export async function syncFoundingMember(address: string | null | undefined): Promise<void> {
  // No WebCrypto (insecure context) means no answer at all; leave the badge be.
  if (!globalThis.crypto?.subtle) return
  const n = await foundingMemberNumber(address)
  const store = usePowerStationStore.getState()
  if (n !== null) store.applyFoundingMember(n)
  else store.clearFoundingMember()
}

/** A sign-in completed: this account's settings, and its own roster answer. */
export function beginAccountSettings(userId: string | number | null | undefined, rosterAddress?: string | null): void {
  if (userId == null || userId === '') return
  usePowerStationStore.getState().switchSettingsAccount(String(userId))
  if (rosterAddress) void syncFoundingMember(rosterAddress)
}

/** Signed out (or the session died): the next person starts from the defaults. */
export function endAccountSettings(): void {
  usePowerStationStore.getState().switchSettingsAccount(null)
}
