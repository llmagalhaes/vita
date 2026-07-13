/**
 * Jest mock of expo-secure-store: an in-memory async store. The native module
 * (Keychain/Keystore) isn't available under Node; only the surface src/auth uses.
 */
const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? store.get(key)! : null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test helper — not part of the real module. */
export function __clear(): void {
  store.clear();
}
