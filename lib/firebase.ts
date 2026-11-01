import { FirebaseApp, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging, type MessagePayload } from "firebase/messaging";

import { firebaseConfig, isFirebaseConfigured } from "@/lib/push/firebaseConfig";
import { registerAppWorker } from "@/lib/pwa/serviceWorker";

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

    // 2. The app's one worker (lib/pwa/serviceWorker): push and the pages kept
    // offline share its scope and its address, so registering it at the root
    // also replaces any older push worker there.
    const registration = await registerAppWorker();
    if (!registration) return null;

    // 3. Wait for the SW to fully activate before requesting token
    await waitForSWActivation(registration);

    // 4. Get FCM token using the activated SW registration
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
