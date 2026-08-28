"use strict";

const CACHE_NAME = "minimal-phone-v2.0.0";
const BASE_URL = new URL("./", self.location.href);
const OFFLINE_URL = new URL("index.html", BASE_URL).href;
const APP_SHELL = [
    "",
    "index.html",
    "style.css",
    "script.js",
    "manifest.webmanifest",
    "icon.svg",
    "icon-192.png",
    "icon-512.png",
    "apple-touch-icon.png"
].map((path) => new URL(path, BASE_URL).href);

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
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    if (request.method !== "GET" || requestUrl.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_URL, copy));
                    return response;
                })
                .catch(async () => {
                    return (await caches.match(OFFLINE_URL)) || (await caches.match(APP_SHELL[0]));
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request).then((response) => {
                if (!response || response.status !== 200 || response.type !== "basic") {
                    return response;
                }

                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                return response;
            });
        })
    );
});
