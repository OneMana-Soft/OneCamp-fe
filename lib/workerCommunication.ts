// lib/workerCommunication.ts

const DB_NAME = 'OneCampDB';
const DB_VERSION = 1;
const STORE_NAME = 'auth';

/**
 * Validates and ensures the proper structure of the database. Good practice internally.
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Set the user UUID natively in IndexedDB 
 */
export async function setWorkerUserUUID(uuid: string): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(uuid, 'userUUID'); // storing direct object

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
      
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[workerCommunication] Failed to store userUUID:', error);
  }
}

/**
 * Optional helper for foreground reading if ever needed.
 */
export async function getWorkerUserUUID(): Promise<string | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('userUUID');

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject((e.target as IDBRequest).error);
      
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[workerCommunication] Failed to read userUUID:', error);
    return null;
  }
}
