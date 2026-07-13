/**
 * Auth session (APP-008). Single source of truth for the token pair.
 *
 * - Tokens live in expo-secure-store (Keychain / Keystore), so the session
 *   survives an app restart and is never in plain storage.
 * - In-memory `current` is the hot copy; `subscribe` drives React via useAuth.
 * - `refresh` is single-flight: concurrent 401s share one rotation call.
 *
 * ponytail: no context/provider — useSyncExternalStore over this module is the
 * whole state layer. Auth endpoints are public, so this just calls `api`.
 */
import * as SecureStore from "expo-secure-store";
import { ApiError, type TokenPair } from "../api/client";
import { api } from "../api";
import { getOidcIdToken } from "./oidc";

const KEY = "vita.session";

type Stored = { accessToken: string; refreshToken: string; expiresAt: number };

let current: Stored | null = null;
let ready = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const isReady = (): boolean => ready;
export const isAuthed = (): boolean => current !== null;
export const getAccessToken = (): string | null => current?.accessToken ?? null;

async function persist(pair: TokenPair | null): Promise<void> {
  if (pair) {
    current = {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresAt: Date.now() + pair.expiresIn * 1000,
    };
    await SecureStore.setItemAsync(KEY, JSON.stringify(current));
  } else {
    current = null;
    await SecureStore.deleteItemAsync(KEY);
  }
  notify();
}

/** Read the stored session once at startup. Call before gating navigation. */
export async function load(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    current = raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    current = null; // corrupt/unavailable store → treat as signed out
  }
  ready = true;
  notify();
}

export async function signInWithMagicLink(token: string): Promise<void> {
  await persist(await api.verifyMagicLink(token));
}

export async function signInWithOidc(provider: "google" | "apple"): Promise<void> {
  const { idToken, nonce, name } = await getOidcIdToken(provider);
  await persist(await api.oidc({ provider, idToken, nonce, name }));
}

let refreshing: Promise<string | null> | null = null;
/** Rotate the token pair. Single-flight; clears the session if the family is revoked. */
export function refresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const rt = current?.refreshToken;
      if (!rt) return null;
      const pair = await api.refresh(rt);
      await persist(pair);
      return pair.accessToken;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await persist(null);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Local clear is immediate and always wins; server revoke is best-effort. */
export async function signOut(): Promise<void> {
  const rt = current?.refreshToken;
  await persist(null);
  if (rt) await api.signOut(rt).catch(() => {});
}

/** Test-only: drop in-memory state (secure-store mock is cleared per file). */
export function _resetForTests(): void {
  current = null;
  ready = false;
  refreshing = null;
}
