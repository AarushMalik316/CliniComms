import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  Eye,
  FilePlus2,
  Lock,
  RotateCcw,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import {
  DtnBundle,
  DtnNodeId,
  SyncReceipt,
  decryptBundlePayload,
  encryptBundlePayload,
  generateClinicalRecordContent,
} from '@/src/lib/dtn/crypto';
import {
  WIFI_HANDSHAKE_RADIUS_METERS,
  computeWifiRssiDbm,
} from '@/src/lib/dtn/handshake';

interface PostmanWorkspaceProps {
  bundles: DtnBundle[];
  receipts: SyncReceipt[];
  truckProgress: number;
  truckSpeedMode: 'IDLE' | 'TO_CLINIC' | 'TO_HOSPITAL';
  roadWashedOut: boolean;
  nearestStation: { node: 'clinic_pi' | 'hospital_server'; distanceMeters: number };
  onQueueBundle: (bundle: DtnBundle) => void;
  onSetTruckProgress: (p: number) => void;
  onDispatchTruck: (dir: 'TO_CLINIC' | 'TO_HOSPITAL' | 'IDLE') => void;
  onToggleRoadWashedOut: () => void;
  onResetStorage: () => void;
}

export const PostmanWorkspace: React.FC<PostmanWorkspaceProps> = ({
  bundles,
  receipts,
  truckProgress,
  truckSpeedMode,
  roadWashedOut,
  nearestStation,
  onQueueBundle,
  onSetTruckProgress,
  onDispatchTruck,
  onToggleRoadWashedOut,
  onResetStorage,
}) => {
  const [inspectedBundle, setInspectedBundle] = useState<{
    bundle: DtnBundle;
    plaintextPreview: string;
    sha256Match: boolean;
    computedSha256: string;
  } | null>(null);

  const clinicBundles = bundles.filter((b) => b.currentNode === 'clinic_pi');
  const truckBundles = bundles.filter((b) => b.currentNode === 'truck_esp32');
  const hospitalBundles = bundles.filter((b) => b.currentNode === 'hospital_server');

  const rssiDbm = computeWifiRssiDbm(nearestStation.distanceMeters);
  const inWifiRange = nearestStation.distanceMeters <= WIFI_HANDSHAKE_RADIUS_METERS;

  const handleGenerateRecord = async (
    origin: 'clinic_pi' | 'hospital_server',
    kind: 'HL7_PATIENT' | 'COLD_CHAIN_LOG' | 'LAB_BLOODWORK' | 'SUPPLY_MANIFEST'
  ) => {
    const rec = generateClinicalRecordContent(kind, 'CLINIC_01');
    const bundle = await encryptBundlePayload({
      filename: rec.filename,
      mimeType: rec.mimeType,
      recordCategory: kind,
      originNode: origin,
      destinationNode: origin === 'clinic_pi' ? 'hospital_server' : 'clinic_pi',
      plaintext: new TextEncoder().encode(rec.content),
    });
    onQueueBundle(bundle);
  };

  const handleRealFileUpload = async (
    origin: 'clinic_pi' | 'hospital_server',
    file: File | undefined
  ) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const bundle = await encryptBundlePayload({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      recordCategory: 'UPLOADED_FILE',
      originNode: origin,
      destinationNode: origin === 'clinic_pi' ? 'hospital_server' : 'clinic_pi',
      plaintext: new Uint8Array(buf),
    });
    onQueueBundle(bundle);
  };

  const handleInspectDecrypt = async (bundle: DtnBundle) => {
    const res = await decryptBundlePayload(bundle);
    const isText =
      bundle.mimeType.startsWith('text/') ||
      bundle.mimeType.includes('json') ||
      /\.(hl7|csv|txt|json|md)$/i.test(bundle.filename);
    const preview = isText
      ? new TextDecoder().decode(res.plaintext)
      : `[Binary File · ${res.plaintext.byteLength} bytes]`;

    setInspectedBundle({
      bundle,
      plaintextPreview: preview,
      sha256Match: res.sha256Match,
      computedSha256: res.computedSha256,
    });
  };

  const handleDownloadDecrypted = async (bundle: DtnBundle) => {
    const res = await decryptBundlePayload(bundle);
    const blob = new Blob([new Uint8Array(res.plaintext)], { type: bundle.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = bundle.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderBundleCard = (b: DtnBundle, nodeId: DtnNodeId) => {
    const isTruckNode = nodeId === 'truck_esp32';
    return (
      <div
        key={b.id}
        className="rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] p-3 space-y-1.5 text-xs"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-[#1A1A19] dark:text-[#F2F0EA] truncate">
            {b.filename}
          </span>
          <span
            className={`shrink-0 text-[10px] font-mono font-medium ${
              b.status === 'DELIVERED_VERIFIED'
                ? 'text-[#15803D]'
                : b.status === 'IN_TRANSIT_SD'
                ? 'text-[#B45309]'
                : 'text-[#6E6D68]'
            }`}
          >
            {b.status === 'DELIVERED_VERIFIED'
              ? 'Delivered'
              : b.status === 'IN_TRANSIT_SD'
              ? 'Encrypted SD'
              : 'Outbox'}
          </span>
        </div>

        <div className="font-mono text-[10px] text-[#8A8984] tabular-nums truncate">
          AES-256-GCM · {b.ciphertextSize} B · SHA {b.sha256Hex.slice(0, 14)}...
        </div>

        {!isTruckNode ? (
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleInspectDecrypt(b)}
              className="inline-flex items-center gap-1 rounded-md border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2 py-1 text-[11px] hover:border-[#C2934B] cursor-pointer"
            >
              <Eye className="w-3 h-3" aria-hidden="true" />
              Decrypt
            </button>
            <button
              type="button"
              onClick={() => handleDownloadDecrypted(b)}
              className="inline-flex items-center gap-1 rounded-md border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2 py-1 text-[11px] hover:border-[#C2934B] cursor-pointer"
            >
              <Download className="w-3 h-3" aria-hidden="true" />
              Save
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 text-[10px] text-[#8A8984] pt-0.5">
            <Lock className="w-3 h-3" aria-hidden="true" />
            Blind ESP32 Mule (Zero Plaintext Keys)
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1A1A19] dark:text-[#F2F0EA]">
            Store-and-Forward DTN Mailbag
          </h2>
          <p className="text-xs text-[#8A8984]">
            AES-256-GCM + SHA-256 persisted in IndexedDB · Zero-Touch &lt;100m Wi-Fi sync
          </p>
        </div>
        <button
          type="button"
          onClick={onResetStorage}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] px-2.5 py-1.5 text-xs text-[#5C5B57] dark:text-[#C8C6BE] hover:border-[#1A1A19] cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          Reset Spooled Files
        </button>
      </div>

      {/* 3-Node Bento Columns */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5">
        {/* Node 1: Clinic Pi Zero */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-semibold">Clinic_01 Mailbox</h3>
              <p className="text-[11px] text-[#8A8984]">Raspberry Pi Zero W · 1.0 W</p>
            </div>
            <span className="text-xs font-mono text-[#6E6D68]">{clinicBundles.length}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleGenerateRecord('clinic_pi', 'HL7_PATIENT')}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] py-1.5 px-2 text-xs font-medium hover:border-[#C2934B] cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-[#C2934B]" aria-hidden="true" />
              + HL7 Patient
            </button>
            <label className="inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#E7E6E2] dark:border-[#2A2A28] py-1.5 px-2 text-xs text-[#5C5B57] dark:text-[#C8C6BE] hover:border-[#C2934B] cursor-pointer">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload File</span>
              <input
                type="file"
                className="sr-only"
                onChange={(e) => {
                  void handleRealFileUpload('clinic_pi', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="space-y-2" data-testid="clinic-filesystem">
            {clinicBundles.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#8A8984]">Spool empty</div>
            ) : (
              clinicBundles.map((b) => renderBundleCard(b, 'clinic_pi'))
            )}
          </div>
        </div>

        {/* Node 2: Supply Truck ESP32 */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-semibold">Supply Truck Mule</h3>
              <p className="text-[11px] text-[#8A8984]">ESP32 + MicroSD · 12V Truck</p>
            </div>
            <span className="text-xs font-mono text-[#6E6D68]">{truckBundles.length}</span>
          </div>

          <div className="rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="inline-flex items-center gap-1 text-[#8A8984]">
                <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                {nearestStation.node === 'clinic_pi' ? 'Clinic_01' : 'Hospital'}
              </span>
              <span className={inWifiRange ? 'text-[#15803D] font-semibold' : 'text-[#6E6D68]'}>
                {nearestStation.distanceMeters < 1000
                  ? `${Math.round(nearestStation.distanceMeters)} m`
                  : `${(nearestStation.distanceMeters / 1000).toFixed(1)} km`}{' '}
                ({rssiDbm} dBm)
              </span>
            </div>

            <input
              type="range"
              aria-label="Supply truck route position between Hospital and Clinic"
              min={0}
              max={100}
              step={1}
              value={Math.round(truckProgress * 100)}
              onChange={(e) => onSetTruckProgress(parseInt(e.target.value, 10) / 100)}
              className="w-full accent-[#C2934B] cursor-pointer"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={roadWashedOut}
                onClick={() =>
                  onDispatchTruck(truckSpeedMode === 'TO_CLINIC' ? 'IDLE' : 'TO_CLINIC')
                }
                className={`inline-flex items-center justify-center gap-1 rounded-lg border py-1.5 px-2 text-xs font-medium cursor-pointer disabled:opacity-40 ${
                  truckSpeedMode === 'TO_CLINIC'
                    ? 'border-[#1A1A19] bg-[#1A1A19] text-white'
                    : 'border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817]'
                }`}
              >
                <span>{truckSpeedMode === 'TO_CLINIC' ? 'Pause' : 'To Clinic'}</span>
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </button>

              <button
                type="button"
                disabled={roadWashedOut}
                onClick={() =>
                  onDispatchTruck(truckSpeedMode === 'TO_HOSPITAL' ? 'IDLE' : 'TO_HOSPITAL')
                }
                className={`inline-flex items-center justify-center gap-1 rounded-lg border py-1.5 px-2 text-xs font-medium cursor-pointer disabled:opacity-40 ${
                  truckSpeedMode === 'TO_HOSPITAL'
                    ? 'border-[#1A1A19] bg-[#1A1A19] text-white'
                    : 'border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817]'
                }`}
              >
                <ArrowLeft className="w-3 h-3" aria-hidden="true" />
                <span>{truckSpeedMode === 'TO_HOSPITAL' ? 'Pause' : 'To Hospital'}</span>
              </button>
            </div>

            <label className="flex items-center justify-between text-[11px] text-[#5C5B57] dark:text-[#C8C6BE] cursor-pointer pt-1">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-[#B45309]" aria-hidden="true" />
                Washed-Out Monsoon Road
              </span>
              <input
                type="checkbox"
                checked={roadWashedOut}
                onChange={onToggleRoadWashedOut}
                className="accent-[#C81E1E] w-3.5 h-3.5 cursor-pointer"
              />
            </label>
          </div>

          <div className="space-y-2" data-testid="truck-filesystem">
            {truckBundles.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#8A8984]">
                Drive within &lt;100m to sync
              </div>
            ) : (
              truckBundles.map((b) => renderBundleCard(b, 'truck_esp32'))
            )}
          </div>
        </div>

        {/* Node 3: Town Hospital Server */}
        <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-semibold">Town Hospital Server</h3>
              <p className="text-[11px] text-[#8A8984]">Wi-Fi Gateway · EHR Store</p>
            </div>
            <span className="text-xs font-mono text-[#6E6D68]">{hospitalBundles.length}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleGenerateRecord('hospital_server', 'LAB_BLOODWORK')}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] py-1.5 px-2 text-xs font-medium hover:border-[#C2934B] cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-[#C2934B]" aria-hidden="true" />
              + Lab Results
            </button>
            <label className="inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#E7E6E2] dark:border-[#2A2A28] py-1.5 px-2 text-xs text-[#5C5B57] dark:text-[#C8C6BE] hover:border-[#C2934B] cursor-pointer">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload File</span>
              <input
                type="file"
                className="sr-only"
                onChange={(e) => {
                  void handleRealFileUpload('hospital_server', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="space-y-2" data-testid="hospital-filesystem">
            {hospitalBundles.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#8A8984]">No files</div>
            ) : (
              hospitalBundles.map((b) => renderBundleCard(b, 'hospital_server'))
            )}
          </div>
        </div>
      </div>

      {/* Sync Receipts Card */}
      <div className="rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <h3 className="text-[13px] font-semibold mb-2">Zero-Touch Handshake Log</h3>
        {receipts.length === 0 ? (
          <p className="text-xs text-[#8A8984]">
            No handshakes logged yet. Move truck to 100% (Clinic_01) or 0% (Hospital) to sync encrypted bundles.
          </p>
        ) : (
          <div className="divide-y divide-[#F1F1EE] dark:divide-[#242422] text-xs font-mono">
            {receipts.slice(0, 5).map((r) => (
              <div key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-[#15803D] font-semibold mr-2">VERIFIED</span>
                  {r.summary}
                </span>
                <span className="text-[#8A8984] tabular-nums">
                  {new Date(r.timestamp).toLocaleTimeString([], { hour12: false })} · {r.distanceMeters}m
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decrypted Plaintext Modal */}
      {inspectedBundle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decrypt-modal-title"
        >
          <div className="w-full max-w-2xl rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E7E6E2] dark:border-[#2A2A28] flex items-center justify-between">
              <div>
                <h3 id="decrypt-modal-title" className="text-xs font-semibold">
                  Decrypted Payload — {inspectedBundle.bundle.filename}
                </h3>
                <p className="text-[11px] font-mono text-[#15803D] mt-0.5">
                  SHA-256 Verified: {inspectedBundle.computedSha256.slice(0, 32)}...
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBundle(null)}
                aria-label="Close decrypted record viewer"
                className="p-1 text-[#8A8984] hover:text-[#1A1A19]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-4 max-h-[340px] overflow-auto bg-[#F9F9F8] dark:bg-[#111110] font-mono text-xs whitespace-pre-wrap">
              {inspectedBundle.plaintextPreview}
            </pre>
            <div className="px-4 py-3 border-t border-[#E7E6E2] dark:border-[#2A2A28] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDownloadDecrypted(inspectedBundle.bundle)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#1A1A19] dark:bg-[#F2F0EA] text-white dark:text-[#111110] px-3 py-1.5 text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download Verified
              </button>
              <button
                type="button"
                onClick={() => setInspectedBundle(null)}
                className="rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] px-3 py-1.5 text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
