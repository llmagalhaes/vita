import { api } from "../api";
import { logChanged } from "./notify";
import { drainOutbox } from "./outbox";
import { syncSettings } from "./settingsSync";

/**
 * Drain the outbox whenever the network comes back. Covers both parked entry
 * writes and offline `interpret` ops (raw captures parsed on reconnect).
 *
 * NetInfo is lazy-required so nothing native loads under jest — the drain logic
 * itself is unit-tested directly against drainOutbox. Returns an unsubscribe fn.
 */
export function startReconnectDrain(): () => void {
  // ponytail: NetInfo is bundled in Expo Go; require lazily to keep it off the test path.
  const NetInfo = require("@react-native-community/netinfo").default;
  let wasConnected = true;
  return NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
    const connected = state.isConnected !== false;
    if (connected && !wasConnected) {
      // APP-110: hydrate if the launch GET failed offline, else re-push an unpushed blob.
      void syncSettings();
      void drainOutbox(api)
        .then(({ synced }) => {
          if (synced > 0) logChanged();
        })
        .catch(() => {});
    }
    wasConnected = connected;
  });
}
