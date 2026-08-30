const CACHE_NAME = "minimal-daily-os-1.0.1-mobile-1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.webmanifest",
    "./icon.svg",
    "./apple-touch-icon.png",
    "./icon-192.png",
    "./icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter((name) => name.startsWith("minimal-") && name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET" || request.cache === "only-if-cached" && request.mode !== "same-origin") {
        return;
    }

    const requestUrl = new URL(request.url);

    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();

                    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));

                    return response;
                })
                .catch(() => caches.match("./index.html"))
        );

        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request).then((response) => {
                if (response.ok && response.type === "basic") {
                    const copy = response.clone();

                    caches
                        .open(CACHE_NAME)
                        .then((cache) =>
                            cache.put(request, copy)
                        );
                }

                return response;
            });
            return cached || network;
        })
    );
});
