/**
 * Session logic against the mock api (no VITA_API_BASE_URL → mock). Covers the
 * magic-link exchange, silent refresh (incl. single-flight + family revoke),
 * sign-out, and persistence across a simulated restart.
 */
import { api } from "../../api";
import * as SecureStore from "expo-secure-store";
import {
  _resetForTests,
  getAccessToken,
  isAuthed,
  load,
  refresh,
  signInWithMagicLink,
  signOut,
} from "../session";

beforeEach(() => {
  (SecureStore as unknown as { __clear: () => void }).__clear();
  _resetForTests();
});

test("magic-link exchange stores a session", async () => {
  await signInWithMagicLink("ok");
  expect(isAuthed()).toBe(true);
  expect(getAccessToken()).toMatch(/^mock-access\./);
});

test("invalid/expired token throws and leaves the app signed out", async () => {
  await expect(signInWithMagicLink("expired")).rejects.toMatchObject({ status: 401 });
  expect(isAuthed()).toBe(false);
});

test("refresh rotates the access token", async () => {
  await signInWithMagicLink("ok");
  const before = getAccessToken();
  const fresh = await refresh();
  expect(fresh).toMatch(/^mock-access\./);
  expect(getAccessToken()).not.toBe(before);
});

test("concurrent refreshes are single-flight (one api call)", async () => {
  await signInWithMagicLink("ok");
  const spy = jest.spyOn(api, "refresh");
  const [a, b] = await Promise.all([refresh(), refresh()]);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(a).toBe(b);
  spy.mockRestore();
});

test("a revoked refresh family (401) clears the session", async () => {
  await signInWithMagicLink("ok");
  jest.spyOn(api, "refresh").mockRejectedValueOnce(
    new (require("../../api/client").ApiError)(401, { type: "about:blank", title: "x", status: 401 }),
  );
  const fresh = await refresh();
  expect(fresh).toBeNull();
  expect(isAuthed()).toBe(false);
});

test("sign-out clears the session and revokes the refresh token", async () => {
  await signInWithMagicLink("ok");
  const spy = jest.spyOn(api, "signOut");
  await signOut();
  expect(isAuthed()).toBe(false);
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});

test("session survives a restart (persisted in secure-store, re-read by load)", async () => {
  await signInWithMagicLink("ok");
  const token = getAccessToken();
  _resetForTests(); // drop in-memory state — a cold app start
  expect(isAuthed()).toBe(false);
  await load();
  expect(isAuthed()).toBe(true);
  expect(getAccessToken()).toBe(token);
});
