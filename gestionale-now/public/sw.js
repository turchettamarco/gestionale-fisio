// FisioHub Service Worker
// Strategia: network-first per API e dati (Supabase sempre fresco)
//            cache-first per icone e asset statici

const CACHE_NAME = "fisiohub-v1";
const STATIC_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

// ── Install: precarica gli asset statici ────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: pulisci vecchie cache ─────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: strategia per tipo di richiesta ──────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo richieste GET vanno in cache
  if (request.method !== "GET") return;

  // Supabase, API Anthropic, chiamate dinamiche → sempre network (no cache)
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("anthropic.com") ||
    url.pathname.startsWith("/api/")
  ) {
    return; // lascia passare al network normale
  }

  // Asset statici (icone, manifest, favicon) → cache-first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Tutto il resto → network-first con fallback alla cache (offline)
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Salva in cache solo risposte OK dello stesso origin
        if (response.ok && url.origin === self.location.origin) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
