const CACHE_NAME = "minimal-daily-os-1.6.0-reminder-1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./logic.js",
    "./sync-core.js",
    "./sync-client.js",
    "./script.js",
    "./manifest.webmanifest",
    "./icon.svg",
    "./fonts/fraunces-latin.woff2",
    "./fonts/figtree-latin.woff2",
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

    // Sync API responses are private and always live: never cache them.
    if (requestUrl.pathname.includes("/api/")) {
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

// Evening reminder (Web Push). The server sends {title, body, url}.
self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: "Minimal", body: event.data ? event.data.text() : "" };
    }
    event.waitUntil(
        self.registration.showNotification(data.title || "Minimal", {
            body: data.body || "",
            tag: "minimal-log",
            icon: "./icon-192.png",
            badge: "./icon-192.png",
            data: { url: data.url || "./" }
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            for (const client of windows) {
                if (client.url.startsWith(self.registration.scope) && "focus" in client) return client.focus();
            }
            return self.clients.openWindow(url);
        })
    );
});
