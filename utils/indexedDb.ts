import type { Session } from '../types';

const DB_NAME = 'banana-batch-db';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_META = 'meta';

type MetaRecord = { key: string; value: unknown };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    transaction.oncomplete = () => {
      db.close();
    };
    transaction.onerror = () => {
      db.close();
    };
  });
}

export async function getAllSessions(): Promise<Session[]> {
  return withStore(STORE_SESSIONS, 'readonly', (store) => store.getAll());
}

export async function putSession(session: Session): Promise<void> {
  await withStore(STORE_SESSIONS, 'readwrite', (store) => store.put(session));
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await withStore(STORE_SESSIONS, 'readwrite', (store) => store.delete(sessionId));
}

export async function setMetaValue<T>(key: string, value: T): Promise<void> {
  const record: MetaRecord = { key, value };
  await withStore(STORE_META, 'readwrite', (store) => store.put(record));
}

export async function getMetaValue<T>(key: string): Promise<T | undefined> {
  const record = await withStore<MetaRecord | undefined>(
    STORE_META,
    'readonly',
    (store) => store.get(key)
  );
  return record?.value as T | undefined;
}
