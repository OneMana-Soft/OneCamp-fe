// public/sw.js: OneCamp's one service worker, at the root, so its scope is the whole app (asana-12).
//
// A scope has one worker, so this one does two jobs:
// - web push (Firebase), where this install has it set up. Its config comes in this file's own address
//   (lib/pwa/serviceWorker workerUrl), as it did for the push worker this replaces: public/firebase-messaging-sw.js
//   now only imports this file, for registrations made before it;
// - the app's pages and files on this device, so OneCamp opens from a cold start with no network (the end of
//   this file).

// The Firebase config, from this worker's own address.
var urlParams = new URLSearchParams(location.search);
var firebaseConfig = {
    apiKey: urlParams.get('apiKey'),
    authDomain: urlParams.get('authDomain'),
    projectId: urlParams.get('projectId'),
    storageBucket: urlParams.get('storageBucket'),
    messagingSenderId: urlParams.get('messagingSenderId'),
    appId: urlParams.get('appId')
};

// Push is set up when the config is here. Without it the worker still keeps the app on the device.
var hasValidConfig = !!(firebaseConfig.apiKey && firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId && firebaseConfig.appId);

var messaging = null;

if (hasValidConfig) {
    // Not caught, as before: a worker that can't fetch Firebase doesn't install, and the next registration tries again.
    importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');
    try {
        firebase.initializeApp(firebaseConfig);
        messaging = firebase.messaging();
    } catch (e) {
        console.error('[FCM SW] Firebase initialization failed:', e);
    }
}

// --- BEGIN notification route (mirror of lib/utils/notificationRoute.ts) ---
// A service worker in public/ is not part of the webpack graph, so it cannot
// import the app's modules. This is therefore a hand-maintained mirror, and
// lib/utils/notificationRoute.test.ts evaluates the code between these markers
// and asserts it agrees with the TypeScript original for every notification type
// the backend sends. Edit one, the test fails until you edit the other.
//
// The payload contract (which ids arrive under which key, and it is NOT uniform)
// is documented in the TypeScript file.
var ONECAMP_NOTIFICATION_FALLBACK_ROUTE = '/app';

function oneCampChatRouteSegment(groupingId, selfUUID) {
    var id = (groupingId || '').trim();
    if (!id) return null;
    if (id.indexOf(' ') === -1) return 'group/' + id;
    var participants = id.split(' ').filter(Boolean);
    if (participants.length < 2) return participants[0] ? 'group/' + participants[0] : null;
    if (!selfUUID) return null;
    var other = null;
    for (var i = 0; i < participants.length; i++) {
        if (participants[i] !== selfUUID) { other = participants[i]; break; }
    }
    return other || participants[0];
}

function oneCampNotificationRoute(data, selfUUID) {
    if (!data || !data.type) return ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
    var typeId = (data.type_id || '').trim();
    var threadId = (data.thread_id || '').trim();
    var type = data.type;

    if (type === 'chat' || type === 'chat_reaction' || type === 'chat_comment' || type === 'chat_comment_reaction') {
        var segment = typeId ? oneCampChatRouteSegment(typeId, selfUUID) : null;
        if (!segment) return ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
        if (type !== 'chat' && threadId) return '/app/chat/' + segment + '/' + threadId;
        return '/app/chat/' + segment;
    }
    if (type === 'channel' || type === 'post_comment') {
        if (!typeId) return ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
        return threadId ? '/app/channel/' + typeId + '/' + threadId : '/app/channel/' + typeId;
    }
    if (type === 'channel_call') {
        return typeId ? '/app/channel/' + typeId : ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
    }
    // The task id is in type_id for 'task'…
    if (type === 'task') {
        return typeId ? '/app/task/' + typeId : ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
    }
    // …and in thread_id for 'task_comment', because type_id carries the project.
    if (type === 'task_comment') {
        return threadId ? '/app/task/' + threadId : ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
    }
    if (type === 'doc_comment') {
        return typeId ? '/app/doc/' + typeId : ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
    }
    // 'table_row': a comment on a table's row; the table in type_id, the row in thread_id.
    if (type === 'table_row') {
        if (!typeId) return ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
        return '/app/tables/' + encodeURIComponent(typeId) + (threadId ? '?row=' + encodeURIComponent(threadId) : '');
    }
    // 'later' carries the app path of the saved item; only an in-app path is followed.
    if (type === 'later') {
        return /^\/app\/[A-Za-z0-9/_-]+(\?[A-Za-z0-9_\-=&%.]*)?$/.test(typeId) ? typeId : '/app/later';
    }
    // 'approval': an agent is waiting; Home leads with "Needs your approval".
    if (type === 'approval') {
        return '/app/home';
    }
    // 'calendar': an event you're asked to, that changed or that a guest
    // answered opens that event or instance; a cancelled booking, or an event
    // you were taken off, carries no id and opens the calendar.
    if (type === 'calendar') {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_\d{8}(T\d{6}Z)?)?$/i.test(typeId)
            ? '/app/calendar/event/' + typeId
            : '/app/calendar';
    }
    // 'reminder' carries no target: focus the app and let it surface the reminder.
    return ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
}
// --- END notification route ---

// --- BEGIN notification tag (mirror of lib/utils/notificationTag.ts) ---
// One notification per place and sender. Tagged by its kind alone ("chat"),
// one sender's notification replaced another's. lib/utils/notificationTag.test.ts
// evaluates the code between these markers and holds it to the TypeScript.
function oneCampNotificationTag(data, selfUUID) {
    function t(v) { return (v || '').trim(); }
    var own = t(data && data.tag);
    var kind = t(data && data.type) || 'general';
    var tag = own || [
        kind,
        t(data && data.type_id),
        // A new message's thread_id is the message itself, not a thread.
        kind === 'chat' || kind === 'channel' ? '' : t(data && data.thread_id),
        t(data && data.username) || t(data && data.body) || t(data && data.title)
    ].filter(Boolean).join(':');
    return selfUUID ? selfUUID + '_' + tag : tag;
}
// --- END notification tag ---

// Helper: Natively read userUUID stored from front-end to customize background behavior natively
function getWorkerUserUUID() {
    return new Promise((resolve) => {
        const DB_NAME = 'OneCampDB';
        const STORE_NAME = 'auth';

        if (!self.indexedDB) {
            resolve(null);
            return;
        }

        const request = self.indexedDB.open(DB_NAME);

        request.onerror = () => {
            resolve(null);
        };

        request.onsuccess = (event) => {
            const db = event.target.result;

            // In case foreground hasn't created the DB properly yet, catch and safely resolve
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                resolve(null);
                db.close();
                return;
            }

            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get('userUUID');

            getRequest.onsuccess = () => {
                resolve(getRequest.result || null);
            };

            getRequest.onerror = () => {
                resolve(null);
            };

            transaction.oncomplete = () => db.close();
        };
    });
}

// Background notification handler — only active when Firebase is properly initialized
if (messaging) {
    messaging.onBackgroundMessage(async (payload) => {

        // Preference: Use notification object if present, fallback to data
        const title = payload.notification?.title || payload.data?.title || "New Message";
        const body = payload.notification?.body || payload.data?.body || "";

        try {
            const activeUserUUID = await getWorkerUserUUID();

            // One per place and sender, scoped to who is signed in, so neither
            // another sender nor another account replaces it.
            const tagData = Object.assign({}, payload.data, payload.notification?.tag ? { tag: payload.notification.tag } : null);
            const dynamicTag = oneCampNotificationTag(tagData, activeUserUUID);

            const notificationOptions = {
                body: body,
                icon: payload.notification?.icon || payload.data?.icon || '/icons/icon-circle-512.png',
                image: payload.notification?.image || payload.data?.image, // Use rich image if available
                badge: '/icons/badge-monochrome.png', // Android status bar badge
                data: payload.data,
                tag: dynamicTag,
                renotify: true,
                vibrate: [200, 100, 200],
            };

            return self.registration.showNotification(title, notificationOptions);

        } catch (e) {
            console.error('[FCM SW] Failed processing background notification:', e);
        }
    });
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil((async () => {
        // Read the user UUID Native from IndexedDB
        const activeUserUUID = await getWorkerUserUUID();

        const data = event.notification.data;
        const urlToOpen = oneCampNotificationRoute(data, activeUserUUID);

        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

        // 1. Check if there's already a tab open with this URL
        for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            if (client.url.includes(urlToOpen) && 'focus' in client) {
                return client.focus();
            }
        }
        // 2. If not, open a new tab
        if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
        }
    })());
});

// --- The app on this device (asana-12) ---
//
// What it keeps:
// - the pages of the signed-in app (/app/**, but not a call's join page), and only once the app has said a member
//   is signed in: the keep message, sent when the Offline Store opens for them (components/offline/OfflineLoader).
//   The forget message, and lib/offline/wipe itself, let them all go when the session ends. A page carries no
//   member's data (the app's layouts are client components); the member's answers are the Offline Store's.
// - the files named by their hash (/_next/static/**) or their version (/fonts/**), over two generations: a file
//   still in use is carried into the newer one, and one unused for a whole generation goes, with the pages kept
//   in it. A page is answered from the device only while every file it used is still here.
// What it never touches: other origins (the API, the realtime connection, storage), writes, a page's data requests
// (RSC), /api/**, partial reads. With no network, the Offline Store answers the API's reads; this worker never does.

var SW_VERSION = 'v1';
var OWN_CACHES = 'onecamp-sw-';
// lib/pwa/serviceWorker's PAGES_CACHE: one cache per member (pagesOf), so a member's pages are never served to
// another. The app deletes them all when a session ends (lib/offline/wipe).
var PAGES_CACHE = OWN_CACHES + 'pages-' + SW_VERSION;
function pagesOf(member) {
    return PAGES_CACHE + ':' + encodeURIComponent(member);
}
var SHELL_CACHE = OWN_CACHES + 'shell-' + SW_VERSION;
var META_CACHE = OWN_CACHES + 'meta-' + SW_VERSION;
var FILES_CACHE = OWN_CACHES + 'static-' + SW_VERSION + '-';
var OFFLINE_PAGE = '/offline.html';
var LAST_PAGE = /__ONECAMP_LAST_PAGE__/g;
// How long a page's own answer is waited for when the device keeps the page: a weak signal can leave the browser
// "online" with nothing getting through.
var PAGE_WAIT_MS = 4000;
var PAGES_KEPT = 60;
var FILES_PER_GENERATION = 800;
var GENERATION = 'x-onecamp-generation';
// Answers the network gives when the app's own server can't: the kept page is better.
var SERVER_DOWN = 500;
var FALLBACK_PAGE = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>You’re offline · OneCamp</title><body data-offline-page style="font:16px/1.5 system-ui,sans-serif;margin:0;padding:48px 16px;text-align:center">' +
    '<h1 style="font-size:20px">You’re offline</h1><p>OneCamp opens here once you’re back online.</p></body></html>';

function noop() {}

function absolute(path) {
    return new URL(path, self.location.origin).href;
}

function escapeAttribute(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One change to the worker's caches at a time: a generation opens once, however many files arrive together.
var queue = Promise.resolve();
function serial(job) {
    var run = queue.then(job, job);
    queue = run.catch(noop);
    return run;
}

// The worker's own state, beside its caches: the current generation, and the member signed in ('' for none).
var STATE_URL = '/__onecamp-sw/state';
var state = null;
function loadState() {
    if (!state) {
        state = caches.open(META_CACHE)
            .then(function (c) { return c.match(absolute(STATE_URL)); })
            .then(function (r) { return r ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (s) {
                return { gen: s && typeof s.gen === 'number' ? s.gen : 0, member: s && typeof s.member === 'string' ? s.member : '' };
            });
    }
    return state;
}
function saveState(next) {
    state = Promise.resolve(next);
    return caches.open(META_CACHE).then(function (c) {
        return c.put(absolute(STATE_URL), new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }));
    });
}

function matchIn(name, url, options) {
    return caches.has(name).then(function (has) {
        return has ? caches.open(name).then(function (c) { return c.match(url, options); }) : undefined;
    });
}

// Answers the request with work(later), and keeps the worker open for what later() was given, however late.
function respond(event, work) {
    var pending = [];
    var later = function (p) { pending.push(p); };
    var answer = Promise.resolve().then(function () { return work(later); });
    event.respondWith(answer);
    event.waitUntil(answer.then(noop, noop).then(function settle() {
        var count = pending.length;
        return Promise.all(pending.map(function (p) { return Promise.resolve(p).catch(noop); })).then(function () {
            if (pending.length > count) return settle();
        });
    }));
}

function isWhole(response) {
    return !!response && response.status === 200 && !response.redirected &&
        response.type !== 'opaque' && response.type !== 'opaqueredirect';
}

function isWholePage(response) {
    return isWhole(response) && /text\/html/i.test(response.headers.get('content-type') || '');
}

// --- Files named by their hash or version ---

function isFile(url) {
    return url.pathname.indexOf('/_next/static/') === 0 || url.pathname.indexOf('/fonts/') === 0;
}

function filesOf(gen) {
    return FILES_CACHE + gen;
}

function keepFile(url, response) {
    return serial(function () {
        return loadState().then(function (s) {
            return caches.open(filesOf(s.gen)).then(function (c) {
                return c.keys().then(function (keys) {
                    if (keys.length < FILES_PER_GENERATION) return c.put(url, response);
                    return nextGeneration(s).then(function (n) {
                        return caches.open(filesOf(n.gen)).then(function (fresh) { return fresh.put(url, response); });
                    });
                });
            });
        });
    });
}

// Opens a generation: the one before last goes, with every page kept in it. Runs inside serial().
function nextGeneration(s) {
    var next = { gen: s.gen + 1, member: s.member };
    return caches.delete(filesOf(s.gen - 1))
        .then(function () { return forgetPagesOf(s.gen - 1, s.member); })
        .then(function () { return saveState(next); })
        .then(function () { return next; });
}

function fromDevice(event, url) {
    respond(event, function (later) {
        return loadState().then(function (s) {
            return matchIn(filesOf(s.gen), url.href).then(function (hit) {
                if (hit) return hit;
                return matchIn(filesOf(s.gen - 1), url.href).then(function (old) {
                    if (old) {
                        later(keepFile(url.href, old.clone()));
                        return old;
                    }
                    return fetch(event.request).then(function (response) {
                        if (isWhole(response)) later(keepFile(url.href, response.clone()));
                        return response;
                    });
                });
            });
        });
    });
}

// --- The app's pages ---

function isAppPage(url) {
    return (url.pathname === '/app' || url.pathname.indexOf('/app/') === 0) && url.pathname.indexOf('/app/meet/join/') !== 0;
}

// Where the app starts: the sign-in page (the manifest's start_url) and /app.
function isStart(url) {
    return url.pathname === '/' || url.pathname === '/app' || url.pathname === '/app/';
}

// Kept under the member it was fetched for, and only while that member is still the one signed in: a page that
// loaded across a sign-out or a switch is kept for no one.
function keepPage(url, response, member) {
    return serial(function () {
        return loadState().then(function (s) {
            if (!s.member || s.member !== member) return undefined;
            return response.blob().then(function (body) {
                var headers = new Headers(response.headers);
                headers.set(GENERATION, String(s.gen));
                headers.delete('vary');
                return caches.open(pagesOf(s.member)).then(function (c) {
                    return c.put(url, new Response(body, { status: 200, headers: headers })).then(function () {
                        return c.keys();
                    }).then(function (keys) {
                        return Promise.all(keys.slice(0, Math.max(0, keys.length - PAGES_KEPT)).map(function (k) { return c.delete(k.url); }));
                    });
                });
            });
        });
    });
}

function forgetPagesOf(gen, member) {
    if (!member) return Promise.resolve();
    var name = pagesOf(member);
    return caches.has(name).then(function (has) {
        if (!has) return undefined;
        return caches.open(name).then(function (c) {
            return c.keys().then(function (keys) {
                return Promise.all(keys.map(function (k) {
                    return c.match(k.url).then(function (page) {
                        if (!page || Number(page.headers.get(GENERATION)) <= gen) return c.delete(k.url);
                    });
                }));
            });
        });
    });
}

// Only the pages kept for the member signed in last: never another member's.
function keptPage(url) {
    return loadState().then(function (s) {
        if (!s.member) return undefined;
        return matchIn(pagesOf(s.member), url.href).then(function (hit) {
            return hit || matchIn(pagesOf(s.member), url.href, { ignoreSearch: true });
        });
    });
}

// The page the member opened last, as the device keeps it.
function lastPage() {
    return loadState().then(function (s) {
        if (!s.member) return null;
        var name = pagesOf(s.member);
        return caches.has(name).then(function (has) {
            if (!has) return null;
            return caches.open(name).then(function (c) { return c.keys(); }).then(function (keys) {
                return keys.length ? keys[keys.length - 1].url : null;
            });
        });
    });
}

// Every member's pages, whoever they were kept for.
function dropPages(except) {
    return caches.keys().then(function (names) {
        return Promise.all(names.filter(function (n) {
            return (n === PAGES_CACHE || n.indexOf(PAGES_CACHE + ':') === 0) && n !== except;
        }).map(function (n) { return caches.delete(n); }));
    });
}

function offlinePage(last) {
    var path = '';
    if (last) {
        var at = new URL(last);
        path = escapeAttribute(at.pathname + at.search);
    }
    return matchIn(SHELL_CACHE, absolute(OFFLINE_PAGE)).then(function (page) {
        return page ? page.text() : FALLBACK_PAGE;
    }).then(function (html) {
        return new Response(html.replace(LAST_PAGE, path), {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
        });
    });
}

// No answer and no page kept: where the app starts, the page opened last; anywhere else, the offline page.
function unanswered(url) {
    return lastPage().then(function (last) {
        if (last && isStart(url)) return Response.redirect(last, 302);
        return offlinePage(last);
    });
}

function within(promise, ms) {
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { resolve(undefined); }, ms);
        promise.then(function (value) {
            clearTimeout(timer);
            resolve(value);
        }, function (error) {
            clearTimeout(timer);
            reject(error);
        });
    });
}

function openPage(event, url) {
    respond(event, function (later) {
        return loadState().then(function (s) {
            var member = s.member;
            var keep = member && isAppPage(url);
            var fresh = Promise.resolve(event.preloadResponse)
                .then(function (preloaded) { return preloaded || fetch(event.request); })
                .then(function (response) {
                    if (keep && isWholePage(response)) later(keepPage(url.href, response.clone(), member));
                    return response;
                });
            later(fresh);
            return keptPage(url).then(function (kept) {
                if (!kept) return fresh.catch(function () { return unanswered(url); });
                return within(fresh, PAGE_WAIT_MS).then(function (response) {
                    return response && response.status < SERVER_DOWN ? response : kept;
                }, function () {
                    return kept;
                });
            });
        });
    });
}

// --- Asked by the app ---

// What loaded before this worker took over, for the member the app named.
function keepAll(urls, member) {
    if (!Array.isArray(urls)) return Promise.resolve();
    return Promise.all(urls.slice(0, 400).map(function (raw) {
        var url;
        try {
            url = new URL(raw);
        } catch (e) {
            return undefined;
        }
        if (url.origin !== self.location.origin) return undefined;
        if (isFile(url)) {
            return loadState().then(function (s) { return matchIn(filesOf(s.gen), url.href); }).then(function (hit) {
                if (hit) return undefined;
                return fetch(url.href).then(function (r) { if (isWhole(r)) return keepFile(url.href, r); });
            }).catch(noop);
        }
        if (isAppPage(url)) {
            return keptPage(url).then(function (hit) {
                if (hit) return undefined;
                return fetch(url.href, { credentials: 'same-origin' }).then(function (r) { if (isWholePage(r)) return keepPage(url.href, r, member); });
            }).catch(noop);
        }
        return undefined;
    }));
}

// The member the app says is signed in. Another member's pages go before any of this member's is kept or served.
function memberSignedIn(member) {
    return serial(function () {
        return loadState().then(function (s) {
            if (s.member === member) return undefined;
            return dropPages().then(function () { return saveState({ gen: s.gen, member: member }); });
        });
    });
}

function forgetPages() {
    return serial(function () {
        return loadState()
            .then(function (s) { return saveState({ gen: s.gen, member: '' }); })
            .then(function () { return dropPages(); });
    });
}

// --- The worker's life ---

self.addEventListener('install', function (event) {
    event.waitUntil(
        fetch(absolute(OFFLINE_PAGE), { cache: 'reload' })
            .then(function (response) {
                if (isWholePage(response)) {
                    return caches.open(SHELL_CACHE).then(function (c) { return c.put(absolute(OFFLINE_PAGE), response); });
                }
            })
            .catch(noop)
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    var preload = self.registration.navigationPreload;
    event.waitUntil(Promise.all([
        self.clients.claim(),
        preload ? preload.enable().catch(noop) : null,
        loadState().then(function (s) {
            var current = [SHELL_CACHE, META_CACHE, filesOf(s.gen), filesOf(s.gen - 1)];
            if (s.member) current.push(pagesOf(s.member));
            return caches.keys().then(function (names) {
                return Promise.all(names.filter(function (name) {
                    return name.indexOf(OWN_CACHES) === 0 && current.indexOf(name) < 0;
                }).map(function (name) { return caches.delete(name); }));
            });
        })
    ]));
});

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;
    var url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (request.mode === 'navigate') return openPage(event, url);
    if (request.headers.get('range')) return;
    if (isFile(url)) return fromDevice(event, url);
});

self.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'onecamp-sw:keep') {
        // Kept only for a member the app names.
        if (typeof data.member !== 'string' || !data.member) return;
        event.waitUntil(memberSignedIn(data.member).then(function () { return keepAll(data.urls, data.member); }));
    } else if (data.type === 'onecamp-sw:forget') {
        event.waitUntil(forgetPages());
    }
});
