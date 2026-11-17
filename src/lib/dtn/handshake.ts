import { DtnBundle, DtnNodeId, SyncReceipt } from './crypto';

export const WIFI_HANDSHAKE_RADIUS_METERS = 100;

/**
 * Estimates 2.4 GHz 802.11n Wi-Fi RSSI in dBm from distance in meters.
 */
export function computeWifiRssiDbm(distanceMeters: number): number {
  const d = Math.max(1, distanceMeters);
  // Log-distance path loss at 2.4 GHz: ~-38 dBm at 1m, n=2.4
  const rssi = -38 - 24 * Math.log10(d);
  return Math.max(-105, Math.min(-32, Math.round(rssi)));
}

export interface HandshakeResult {
  triggered: boolean;
  updatedBundles: DtnBundle[];
  receipt: SyncReceipt | null;
}

/**
 * Performs a Zero-Touch Bidirectional Delta Sync when the Supply Truck ESP32
 * enters <100m Wi-Fi proximity of either Clinic_01 Pi Zero or Town Hospital Server.
 */
export function executeProximityHandshake(params: {
  bundles: DtnBundle[];
  peerStation: 'clinic_pi' | 'hospital_server';
  distanceMeters: number;
}): HandshakeResult {
  const { bundles, peerStation, distanceMeters } = params;
  if (distanceMeters > WIFI_HANDSHAKE_RADIUS_METERS) {
    return { triggered: false, updatedBundles: bundles, receipt: null };
  }

  let transferred = 0;
  let bytesTransferred = 0;
  const now = Date.now();

  const updatedBundles: DtnBundle[] = bundles.map((bundle) => {
    // Case 1: Station has an outbox bundle bound for the remote peer -> upload to Truck ESP32 SD
    if (
      bundle.currentNode === peerStation &&
      bundle.destinationNode !== peerStation &&
      bundle.status === 'QUEUED_OUTBOX'
    ) {
      transferred++;
      bytesTransferred += bundle.ciphertextSize;
      return {
        ...bundle,
        currentNode: 'truck_esp32' as DtnNodeId,
        status: 'IN_TRANSIT_SD',
        syncedAt: now,
      };
    }

    // Case 2: Truck ESP32 carries an encrypted bundle destined for this station -> offload & verify
    if (
      bundle.currentNode === 'truck_esp32' &&
      bundle.destinationNode === peerStation &&
      bundle.status === 'IN_TRANSIT_SD'
    ) {
      transferred++;
      bytesTransferred += bundle.ciphertextSize;
      return {
        ...bundle,
        currentNode: peerStation,
        status: 'DELIVERED_VERIFIED',
        deliveredAt: now,
      };
    }

    return bundle;
  });

  if (transferred === 0) {
    return { triggered: false, updatedBundles: bundles, receipt: null };
  }

  const rssiDbm = computeWifiRssiDbm(distanceMeters);
  const stationLabel = peerStation === 'clinic_pi' ? 'Clinic_01 Pi Zero' : 'Town Hospital Server';
  const receipt: SyncReceipt = {
    id: `SYNC-${now.toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
    timestamp: now,
    peerA: 'truck_esp32',
    peerB: peerStation,
    distanceMeters: Math.round(distanceMeters),
    rssiDbm,
    bundlesTransferred: transferred,
    bytesTransferred,
    sha256Verified: true,
    summary: `Zero-Touch 802.11n handshake with ${stationLabel}: ${transferred} AES-256-GCM bundle(s), ${bytesTransferred} B verified.`,
  };

  return {
    triggered: true,
    updatedBundles,
    receipt,
  };
}
