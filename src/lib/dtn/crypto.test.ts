import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptBundlePayload,
  encryptBundlePayload,
  generateClinicalRecordContent,
} from './crypto';
import { executeProximityHandshake } from './handshake';

test('Web Crypto AES-256-GCM encrypts and decrypts clinical bundle with SHA-256 verification', async () => {
  const rec = generateClinicalRecordContent('HL7_PATIENT', 'CLINIC_01');
  const rawBytes = new TextEncoder().encode(rec.content);

  const bundle = await encryptBundlePayload({
    filename: rec.filename,
    mimeType: rec.mimeType,
    recordCategory: 'HL7_PATIENT',
    originNode: 'clinic_pi',
    destinationNode: 'hospital_server',
    plaintext: rawBytes,
  });

  assert.equal(bundle.originNode, 'clinic_pi');
  assert.equal(bundle.status, 'QUEUED_OUTBOX');
  assert.equal(bundle.ivHex.length, 24); // 12 bytes
  assert.equal(bundle.sha256Hex.length, 64); // 32 bytes

  const decrypted = await decryptBundlePayload(bundle);
  assert.equal(decrypted.sha256Match, true);
  assert.equal(new TextDecoder().decode(decrypted.plaintext), rec.content);
});

test('Zero-Touch Wi-Fi handshake only triggers within 100m and transfers encrypted bundles end-to-end', async () => {
  const rec = generateClinicalRecordContent('COLD_CHAIN_LOG', 'CLINIC_01');
  const bundle = await encryptBundlePayload({
    filename: rec.filename,
    mimeType: rec.mimeType,
    recordCategory: 'COLD_CHAIN_LOG',
    originNode: 'clinic_pi',
    destinationNode: 'hospital_server',
    plaintext: new TextEncoder().encode(rec.content),
  });

  // Out of range (250m)
  const far = executeProximityHandshake({
    bundles: [bundle],
    peerStation: 'clinic_pi',
    distanceMeters: 250,
  });
  assert.equal(far.triggered, false);

  // Within range at Clinic (45m) -> loads onto Truck ESP32 SD
  const clinicSync = executeProximityHandshake({
    bundles: [bundle],
    peerStation: 'clinic_pi',
    distanceMeters: 45,
  });
  assert.equal(clinicSync.triggered, true);
  assert.equal(clinicSync.updatedBundles[0].currentNode, 'truck_esp32');
  assert.equal(clinicSync.updatedBundles[0].status, 'IN_TRANSIT_SD');

  // Within range at Town Hospital (30m) -> delivers & verifies
  const hospitalSync = executeProximityHandshake({
    bundles: clinicSync.updatedBundles,
    peerStation: 'hospital_server',
    distanceMeters: 30,
  });
  assert.equal(hospitalSync.triggered, true);
  assert.equal(hospitalSync.updatedBundles[0].currentNode, 'hospital_server');
  assert.equal(hospitalSync.updatedBundles[0].status, 'DELIVERED_VERIFIED');
});
