import {
  DtnBundle,
  SyncReceipt,
  encryptBundlePayload,
  generateClinicalRecordContent,
} from './crypto';

const DB_NAME = 'screech_postman_dtn_v1';
const DB_VERSION = 1;
const STORE_BUNDLES = 'bundles';
const STORE_RECEIPTS = 'receipts';
const LS_FALLBACK_KEY = 'screech_postman_dtn_fallback_v1';

export interface DtnPersistedState {
  bundles: DtnBundle[];
  receipts: SyncReceipt[];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BUNDLES)) {
        db.createObjectStore(STORE_BUNDLES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_RECEIPTS)) {
        db.createObjectStore(STORE_RECEIPTS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function readLocalFallback(): Promise<DtnPersistedState | null> {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DtnPersistedState;
  } catch {
    return null;
  }
}

async function writeLocalFallback(state: DtnPersistedState): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadDtnState(): Promise<DtnPersistedState> {
  try {
    const db = await openDatabase();
    const bundles = await new Promise<DtnBundle[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BUNDLES, 'readonly');
      const req = tx.objectStore(STORE_BUNDLES).getAll();
      req.onsuccess = () => resolve((req.result as DtnBundle[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    const receipts = await new Promise<SyncReceipt[]>((resolve, reject) => {
      const tx = db.transaction(STORE_RECEIPTS, 'readonly');
      const req = tx.objectStore(STORE_RECEIPTS).getAll();
      req.onsuccess = () => resolve((req.result as SyncReceipt[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (bundles.length > 0 || receipts.length > 0) {
      return {
        bundles: bundles.sort((a, b) => b.createdAt - a.createdAt),
        receipts: receipts.sort((a, b) => b.timestamp - a.timestamp),
      };
    }
  } catch {
    const fallback = await readLocalFallback();
    if (fallback && (fallback.bundles.length > 0 || fallback.receipts.length > 0)) {
      return fallback;
    }
  }

  // First boot: seed deterministic real encrypted bundles so all 3 filesystems are inspectable
  const enc = new TextEncoder();
  const coldChain = generateClinicalRecordContent('COLD_CHAIN_LOG', 'CLINIC_01');
  const labResult = generateClinicalRecordContent('LAB_BLOODWORK', 'CLINIC_01');

  const seededClinicBundle = await encryptBundlePayload({
    filename: coldChain.filename,
    mimeType: coldChain.mimeType,
    recordCategory: 'COLD_CHAIN_LOG',
    originNode: 'clinic_pi',
    destinationNode: 'hospital_server',
    plaintext: enc.encode(coldChain.content),
  });

  const seededHospitalBundle = await encryptBundlePayload({
    filename: labResult.filename,
    mimeType: labResult.mimeType,
    recordCategory: 'LAB_BLOODWORK',
    originNode: 'hospital_server',
    destinationNode: 'clinic_pi',
    plaintext: enc.encode(labResult.content),
  });

  const initial: DtnPersistedState = {
    bundles: [seededClinicBundle, seededHospitalBundle],
    receipts: [],
  };
  await saveDtnState(initial);
  return initial;
}

export async function saveDtnState(state: DtnPersistedState): Promise<void> {
  await writeLocalFallback(state);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_BUNDLES, STORE_RECEIPTS], 'readwrite');
      const bStore = tx.objectStore(STORE_BUNDLES);
      const rStore = tx.objectStore(STORE_RECEIPTS);
      bStore.clear();
      rStore.clear();
      for (const b of state.bundles) bStore.put(b);
      for (const r of state.receipts) rStore.put(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // localStorage fallback already updated
  }
}

export async function resetDtnStorage(): Promise<DtnPersistedState> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LS_FALLBACK_KEY);
  }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_BUNDLES, STORE_RECEIPTS], 'readwrite');
      tx.objectStore(STORE_BUNDLES).clear();
      tx.objectStore(STORE_RECEIPTS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
  return loadDtnState();
}
