import { FirebaseApp, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging, type MessagePayload } from "firebase/messaging";

import { firebaseConfig, isFirebaseConfigured } from "@/lib/push/firebaseConfig";

// The Firebase SDK, for web push. Nothing on a first screen imports this file:
// components/fcm/FCMHandler fetches it once the page is idle, and asks
// lib/push/firebaseConfig (no SDK) whether push is set up at all.
export { isFirebaseConfigured };

let app: FirebaseApp | undefined;
export let messaging: Messaging | undefined;

if (typeof window !== "undefined" && isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  } catch (error) {
    console.warn("[FCM] Firebase initialization failed:", error);
  }
}

/**
 * Build the service worker URL with Firebase config as query params.
 * The SW reads these to initialize Firebase in its own scope.
 */
function buildSwUrl(): string {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || '',
    authDomain: firebaseConfig.authDomain || '',
    projectId: firebaseConfig.projectId || '',
    storageBucket: firebaseConfig.storageBucket || '',
    messagingSenderId: firebaseConfig.messagingSenderId || '',
    appId: firebaseConfig.appId || '',
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

/**
 * Clean up stale service worker registrations that don't have Firebase config.
 * This handles the transition from old ServiceWorkerRegister (no params) to
 * the new FCMHandler-based registration (with params).
 */
async function cleanupStaleSWs(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
      if (scriptUrl.includes('firebase-messaging-sw.js') && !scriptUrl.includes('apiKey=')) {
        console.log('[FCM] Unregistering stale service worker:', scriptUrl);
        await reg.unregister();
      }
    }
  } catch (e) {
    console.warn('[FCM] Failed to clean up stale SWs:', e);
  }
}

/**
 * Wait for a specific SW registration to have an active worker.
 */
async function waitForSWActivation(registration: ServiceWorkerRegistration): Promise<void> {
  const sw = registration.installing || registration.waiting || registration.active;
  if (!sw) return;

  if (sw.state === 'activated') return;

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      sw.removeEventListener('statechange', handler);
      console.warn('[FCM] SW activation timed out after 10s, proceeding anyway');
      resolve();
    }, 10000);

    function handler() {
      if (sw!.state === 'activated') {
        clearTimeout(timeout);
        sw!.removeEventListener('statechange', handler);
        resolve();
      }
    }

    sw.addEventListener('statechange', handler);
  });
}

/**
 * Register the FCM service worker, get the push token.
 * Handles: permission request, stale SW cleanup, SW activation, token generation.
 */
export const getFCMToken = async (): Promise<string | null> => {
  if (!messaging) return null;

  try {
    // 1. Request notification permission explicitly (required on mobile PWA)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission denied');
      return null;
    }

    // 2. Clean up stale SWs from old ServiceWorkerRegister (no config params)
    await cleanupStaleSWs();

    // 3. Register the SW with Firebase config in URL params
    const swUrl = buildSwUrl();
    const registration = await navigator.serviceWorker.register(swUrl, {
      updateViaCache: 'none', // Always check server for SW updates
    });

    // 4. Wait for the SW to fully activate before requesting token
    await waitForSWActivation(registration);

    // 5. Get FCM token using the activated SW registration
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log('[FCM] Token obtained successfully');
    } else {
      console.warn('[FCM] getToken returned null: check VAPID key and Firebase project config');
    }

    return token;
  } catch (error) {
    console.error("[FCM] Token Error:", error);
    return null;
  }
};

/**
 * Calls `fn` with each push that arrives while the app is in front; returns
 * the unsubscribe. Nothing is called where Firebase didn't start.
 */
export function onForegroundMessage(fn: (payload: MessagePayload) => void): () => void {
  if (!messaging) return () => {};
  return onMessage(messaging, fn);
}
