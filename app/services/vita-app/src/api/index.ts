import { apiBaseUrl } from "../config";
import { type Api, createHttpApi } from "./client";
import { createMockApi } from "./mock";

export * from "./client";

/** No VITA_API_BASE_URL configured → fully mocked app (M1 walkable build). */
export const isMockApi = apiBaseUrl === "";

// Lazy thunks avoid an import cycle (session imports this module for its auth calls).
export const api: Api = isMockApi
  ? createMockApi()
  : createHttpApi(apiBaseUrl, {
      getAccessToken: () => require("../auth/session").getAccessToken(),
      refresh: () => require("../auth/session").refresh(),
    });
