/**
 * Real Web Crypto API AES-256-GCM + SHA-256 Engine for THE POSTMAN DTN
 * Encrypts medical records and files at rest on Clinic Pi Zero, Truck ESP32 SD, and Hospital Server.
 */

export type DtnNodeId = 'clinic_pi' | 'truck_esp32' | 'hospital_server';

export interface DtnBundle {
  id: string;
  filename: string;
  mimeType: string;
  recordCategory: 'HL7_PATIENT' | 'COLD_CHAIN_LOG' | 'LAB_BLOODWORK' | 'SUPPLY_MANIFEST' | 'UPLOADED_FILE';
  originNode: DtnNodeId;
  destinationNode: DtnNodeId;
  currentNode: DtnNodeId;
  createdAt: number;
  syncedAt?: number;
  deliveredAt?: number;
  plaintextSize: number;
  ciphertextSize: number;
  sha256Hex: string;
  ivHex: string;
  ciphertextBase64: string;
  status: 'QUEUED_OUTBOX' | 'IN_TRANSIT_SD' | 'DELIVERED_VERIFIED';
}

export interface SyncReceipt {
  id: string;
  timestamp: number;
  peerA: DtnNodeId;
  peerB: DtnNodeId;
  distanceMeters: number;
  rssiDbm: number;
  bundlesTransferred: number;
  bytesTransferred: number;
  sha256Verified: boolean;
  summary: string;
}

// Deterministic shared pre-positioned 256-bit AES-GCM clinic-hospital key material
// Derived from field deployment passphrase via PBKDF2/SHA-256 or raw 32-byte key
const FIELD_MASTER_KEY_HEX =
  '4b9e1f08c32a7d6590e4b1a82f73c5d91e84a0b2c6f3d589a1e7c4b2d0f8a361';

function getCryptoSubtle(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (crypto.subtle) is unavailable in this environment');
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let bin = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function importMasterKey(): Promise<CryptoKey> {
  const subtle = getCryptoSubtle();
  const raw = hexToBytes(FIELD_MASTER_KEY_HEX);
  return subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function computeSha256Hex(data: Uint8Array): Promise<string> {
  const subtle = getCryptoSubtle();
  const copy = new Uint8Array(data).buffer;
  const digest = await subtle.digest('SHA-256', copy);
  return bytesToHex(new Uint8Array(digest));
}

export async function encryptBundlePayload(params: {
  filename: string;
  mimeType: string;
  recordCategory: DtnBundle['recordCategory'];
  originNode: DtnNodeId;
  destinationNode: DtnNodeId;
  plaintext: Uint8Array;
}): Promise<DtnBundle> {
  const subtle = getCryptoSubtle();
  const key = await importMasterKey();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const sha256Hex = await computeSha256Hex(params.plaintext);
  const plainBuf = new Uint8Array(params.plaintext).buffer;
  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plainBuf
  );
  const cipherBytes = new Uint8Array(cipherBuf);

  return {
    id: `DTN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
    filename: params.filename,
    mimeType: params.mimeType || 'application/octet-stream',
    recordCategory: params.recordCategory,
    originNode: params.originNode,
    destinationNode: params.destinationNode,
    currentNode: params.originNode,
    createdAt: Date.now(),
    plaintextSize: params.plaintext.byteLength,
    ciphertextSize: cipherBytes.byteLength,
    sha256Hex,
    ivHex: bytesToHex(iv),
    ciphertextBase64: bytesToBase64(cipherBytes),
    status: 'QUEUED_OUTBOX',
  };
}

export async function decryptBundlePayload(bundle: DtnBundle): Promise<{
  plaintext: Uint8Array;
  sha256Match: boolean;
  computedSha256: string;
}> {
  const subtle = getCryptoSubtle();
  const key = await importMasterKey();
  const iv = hexToBytes(bundle.ivHex);
  const cipherBytes = base64ToBytes(bundle.ciphertextBase64);

  const plainBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    cipherBytes.buffer as ArrayBuffer
  );
  const plaintext = new Uint8Array(plainBuf);
  const computedSha256 = await computeSha256Hex(plaintext);

  return {
    plaintext,
    sha256Match: computedSha256 === bundle.sha256Hex,
    computedSha256,
  };
}

export function generateClinicalRecordContent(
  kind: 'HL7_PATIENT' | 'COLD_CHAIN_LOG' | 'LAB_BLOODWORK' | 'SUPPLY_MANIFEST',
  clinicId = 'CLINIC_01'
): { filename: string; mimeType: string; content: string } {
  const iso = new Date().toISOString();
  const stamp = iso.replace(/[:.]/g, '-').slice(0, 19);
  if (kind === 'HL7_PATIENT') {
    return {
      filename: `hl7_patient_encounter_${stamp}.hl7`,
      mimeType: 'text/plain',
      content: [
        `MSH|^~\\&|${clinicId}|PI_ZERO_DTN|TOWN_HOSPITAL|CENTRAL_EHR|${iso.slice(0, 19)}||ORU^R01|MSG00419|P|2.5`,
        `PID|1||PAT-4821^^^DESERT_REG||AL-MANSOURI^TARIQ||19840312|M|||SECTOR 4 OUTPOST`,
        `OBR|1||ORD-991|VITALS_TRAUMA^Field Triage Panel|||${iso.slice(0, 19)}`,
        `OBX|1|NM|8867-4^Heart rate||94|/min|60-100|N|||F`,
        `OBX|2|NM|8480-6^Systolic BP||118|mmHg|90-140|N|||F`,
        `OBX|3|NM|8310-5^Body temperature||38.4|Cel|36.1-37.5|H|||F`,
        `NTE|1||Dehydration + laceration sutured. Requesting tetanus booster resupply via next truck.`,
      ].join('\n'),
    };
  }
  if (kind === 'COLD_CHAIN_LOG') {
    return {
      filename: `vaccine_cold_chain_${stamp}.csv`,
      mimeType: 'text/csv',
      content: [
        'timestamp_utc,node_id,probe_temp_c,ambient_temp_c,battery_pct,compressor_state,alert_flag',
        `${iso},${clinicId},3.84,41.2,92,ACTIVE,0`,
        `${iso},${clinicId},4.12,42.5,90,ACTIVE,0`,
        `${iso},${clinicId},4.35,43.1,88,ACTIVE,0`,
        `${iso},${clinicId},7.91,44.0,85,ACTIVE,0`,
      ].join('\n'),
    };
  }
  if (kind === 'LAB_BLOODWORK') {
    return {
      filename: `lab_hematology_results_${stamp}.json`,
      mimeType: 'application/json',
      content: JSON.stringify(
        {
          resourceType: 'DiagnosticReport',
          status: 'final',
          issued: iso,
          origin: 'TOWN_HOSPITAL_LAB',
          destination: clinicId,
          patientId: 'PAT-4821',
          panel: 'CBC + Malaria Smear + Electrolytes',
          results: {
            sodium_mmol_l: 131,
            potassium_mmol_l: 3.9,
            hemoglobin_g_dl: 13.8,
            malaria_rdt: 'NEGATIVE',
          },
          clinicalGuidance: 'Administer oral rehydration salts + 2L IV isotonic saline over 6h.',
        },
        null,
        2
      ),
    };
  }
  return {
    filename: `resupply_manifest_${stamp}.txt`,
    mimeType: 'text/plain',
    content: [
      `SUPPLY MANIFEST // DEST: ${clinicId}`,
      `DISPATCHED: ${iso}`,
      `CARRIER: SUPPLY_TRUCK_ESP32_MULE`,
      '----------------------------------------',
      '01. ORS Rehydration Packets        x 120',
      '02. Tetanus Toxoid Vials (2-8C)    x  24',
      '03. Sterile Suture Kits 3-0        x  15',
      '04. LiFePO4 12V Reserve Cell       x   1',
    ].join('\n'),
  };
}
