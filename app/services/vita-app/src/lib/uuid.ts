import * as Crypto from "expo-crypto";

/** UUID v4 — expo-crypto on device, global crypto in Node/tests. */
export function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Crypto.randomUUID();
}
