import { FirebaseApp, initializeApp } from "firebase/app";
import { getMessaging, getToken, Messaging, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check if Firebase is properly configured
export const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

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
      console.warn('[FCM] getToken returned null — check VAPID key and Firebase project config');
    }

    return token;
  } catch (error) {
    console.error("[FCM] Token Error:", error);
    return null;
  }
};

export default app;
