// public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Parse URL query parameters to get Firebase config
const urlParams = new URLSearchParams(location.search);
const firebaseConfig = {
    apiKey: urlParams.get('apiKey'),
    authDomain: urlParams.get('authDomain'),
    projectId: urlParams.get('projectId'),
    storageBucket: urlParams.get('storageBucket'),
    messagingSenderId: urlParams.get('messagingSenderId'),
    appId: urlParams.get('appId')
};

// Guard: If config is missing (stale SW registration without params), skip Firebase init.
// This prevents crashes for SWs cached from old registrations.
const hasValidConfig = firebaseConfig.apiKey && firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId && firebaseConfig.appId;

let messaging = null;

if (hasValidConfig) {
    try {
        firebase.initializeApp(firebaseConfig);
        messaging = firebase.messaging();
    } catch (e) {
        console.error('[FCM SW] Firebase initialization failed:', e);
    }
} else {
    console.warn('[FCM SW] Missing Firebase config — this service worker will be replaced on next app load.');
}

// Force the installing service worker to activate immediately.
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Once activated, immediately take control of the page
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

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
    // 'reminder' carries no target: focus the app and let it surface the reminder.
    return ONECAMP_NOTIFICATION_FALLBACK_ROUTE;
}
// --- END notification route ---

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

            let dynamicTag = payload.notification?.tag || payload.data?.tag || payload.data?.type || 'general';

            // If userUUID exists explicitly scope notification so different users don't swallow tags if logged out/swapped!
            if (activeUserUUID) {
                dynamicTag = activeUserUUID + "_" + dynamicTag;
            }

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
