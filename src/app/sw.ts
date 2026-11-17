import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist } from "serwist";

/**
 * Service worker (PWA).
 *
 * Strategie bewust eenvoudig gehouden (geen offline datasynchronisatie):
 * - app-shell en statische assets: precache + de standaard Next.js-caching
 * - ALLE /api-verkeer: NetworkOnly — planning/registratie mag nooit uit een
 *   cache komen; zonder netwerk toont de UI een nette foutmelding.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope & ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
