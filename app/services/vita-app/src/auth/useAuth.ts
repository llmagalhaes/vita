import { useSyncExternalStore } from "react";
import { isAuthed, isReady, subscribe } from "./session";

/** Re-renders on sign-in/sign-out. */
export const useAuth = (): boolean => useSyncExternalStore(subscribe, isAuthed);

/** False until the stored session has been read from secure-store once. */
export const useAuthReady = (): boolean => useSyncExternalStore(subscribe, isReady);
