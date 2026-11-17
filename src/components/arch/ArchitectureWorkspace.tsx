import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import screechTxSource from '../../../firmware/screech_tx_node/screech_tx_node.ino?raw';
import postmanTruckSource from '../../../firmware/postman_truck_mule/postman_truck_mule.ino?raw';
import clinicPiDaemonSource from '../../../firmware/clinic_pi_mailbox/mailbox_daemon.py?raw';

type FirmwareTab = 'screech' | 'truck' | 'pi';

const FIRMWARE_FILES: Record<
  FirmwareTab,
  { path: string; filename: string; lang: string; code: string }
> = {
  screech: {
    path: 'firmware/screech_tx_node/screech_tx_node.ino',
    filename: 'screech_tx_node.ino',
    lang: 'C++ · ESP32 Bell 202 AFSK + RS-FEC',
    code: screechTxSource,
  },
  truck: {
    path: 'firmware/postman_truck_mule/postman_truck_mule.ino',
    filename: 'postman_truck_mule.ino',
    lang: 'C++ · ESP32 Wi-Fi Auto-Sync + MicroSD',
    code: postmanTruckSource,
  },
  pi: {
    path: 'firmware/clinic_pi_mailbox/mailbox_daemon.py',
    filename: 'mailbox_daemon.py',
    lang: 'Python 3 · 1.0W Pi Zero AES-256-GCM Daemon',
    code: clinicPiDaemonSource,
  },
};

export const ArchitectureWorkspace: React.FC = () => {
  const [activeFw, setActiveFw] = useState<FirmwareTab>('screech');
  const [batteryWh, setBatteryWh] = useState<number>(384);
  const [copied, setCopied] = useState<boolean>(false);

  const currentFw = FIRMWARE_FILES[activeFw];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentFw.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadFirmware = () => {
    const blob = new Blob([currentFw.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFw.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3.5">
      {/* Top Row: BOM & Solar Audit + Failure Modes */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
        <div className="xl:col-span-7 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">Power &amp; Cost Comparison</h2>
            <span className="text-xs font-mono text-[#6E6D68] tabular-nums">
              Battery: {batteryWh} Wh
            </span>
          </div>

          <input
            type="range"
            aria-label="Clinic LiFePO4 battery capacity in Watt-hours"
            min={120}
            max={1200}
            step={24}
            value={batteryWh}
            onChange={(e) => setBatteryWh(parseInt(e.target.value, 10))}
            className="w-full accent-[#C2934B] cursor-pointer"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[#E7E6E2] dark:border-[#2A2A28] text-[11px] text-[#8A8984]">
                  <th className="py-2 pr-3 font-medium">System</th>
                  <th className="py-2 px-3 font-medium">BOM</th>
                  <th className="py-2 px-3 font-medium">Monthly</th>
                  <th className="py-2 px-3 font-medium">Load</th>
                  <th className="py-2 pl-3 text-right font-medium">Autonomy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F1EE] dark:divide-[#242422] font-mono">
                <tr className="font-semibold text-[#15803D]">
                  <td className="py-2 pr-3">SCREECH // POSTMAN</td>
                  <td className="py-2 px-3">$37</td>
                  <td className="py-2 px-3">$0/mo</td>
                  <td className="py-2 px-3">1.8 W</td>
                  <td className="py-2 pl-3 text-right">{Math.round(batteryWh / 1.8)} hrs</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Starlink Dishy</td>
                  <td className="py-2 px-3">$599</td>
                  <td className="py-2 px-3 text-[#C81E1E]">$120/mo</td>
                  <td className="py-2 px-3 text-[#C81E1E]">65.0 W</td>
                  <td className="py-2 pl-3 text-right text-[#C81E1E]">
                    {Math.round(batteryWh / 65.0)} hrs
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">LoRa / Meshtastic</td>
                  <td className="py-2 px-3">$95</td>
                  <td className="py-2 px-3">$0/mo</td>
                  <td className="py-2 px-3">0.9 W</td>
                  <td className="py-2 pl-3 text-right">{Math.round(batteryWh / 0.9)} hrs</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Garmin inReach</td>
                  <td className="py-2 px-3">$350</td>
                  <td className="py-2 px-3 text-[#B45309]">$35/mo</td>
                  <td className="py-2 px-3">0.4 W</td>
                  <td className="py-2 pl-3 text-right">Internal cell</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <h2 className="text-[13px] font-semibold">Physical Failure Modes &amp; $37 BOM</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#F9F9F8] dark:bg-[#141413] p-2.5 border border-[#E7E6E2] dark:border-[#2A2A28]">
              <div className="text-[11px] text-[#8A8984]">TRRS Audio Cable</div>
              <div className="font-mono font-medium mt-0.5">$2 · PC817 + 10uF</div>
            </div>
            <div className="rounded-lg bg-[#F9F9F8] dark:bg-[#141413] p-2.5 border border-[#E7E6E2] dark:border-[#2A2A28]">
              <div className="text-[11px] text-[#8A8984]">Ranger Post Kiosk</div>
              <div className="font-mono font-medium mt-0.5">$30 · Refurb Android</div>
            </div>
            <div className="rounded-lg bg-[#F9F9F8] dark:bg-[#141413] p-2.5 border border-[#E7E6E2] dark:border-[#2A2A28]">
              <div className="text-[11px] text-[#8A8984]">Truck Data Mule</div>
              <div className="font-mono font-medium mt-0.5">$5 · ESP32 + MicroSD</div>
            </div>
            <div className="rounded-lg bg-[#F9F9F8] dark:bg-[#141413] p-2.5 border border-[#E7E6E2] dark:border-[#2A2A28]">
              <div className="text-[11px] text-[#8A8984]">Clinic Mailbox</div>
              <div className="font-mono font-medium mt-0.5">Pi Zero W (1.0W)</div>
            </div>
          </div>
          <div className="text-xs text-[#5C5B57] dark:text-[#C8C6BE] space-y-1.5 leading-relaxed">
            <p>
              <strong>1. Canyon Shadow:</strong> Without a hilltop repeater, deep sandstone canyons attenuate 146.520 MHz VHF below -118 dBm.
            </p>
            <p>
              <strong>2. Monsoon Roads:</strong> Flash floods halt truck DTN bulk sync, though 28-byte VHF SOS alerts remain live.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Row: TRRS Schematic + Firmware Viewer */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
        <div className="xl:col-span-5 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <h2 className="text-[13px] font-semibold">$2 TRRS-to-Walkie-Talkie Schematic</h2>
          <svg
            viewBox="0 0 540 310"
            className="w-full h-auto rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413]"
            role="img"
            aria-label="Schematic diagram of the $2 TRRS to Walkie-Talkie Optocoupler Interface"
          >
            <rect x="20" y="24" width="140" height="260" fill="none" stroke="#3D3D3A" strokeWidth="1.5" className="dark:stroke-[#F2F0EA]" />
            <text x="30" y="44" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono, monospace" fill="#3D3D3A" className="dark:fill-[#F2F0EA]">
              ESP32 / HOST
            </text>
            <text x="30" y="84" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">GPIO25 (PTT)</text>
            <text x="30" y="144" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">GPIO26 (DAC)</text>
            <text x="30" y="214" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">GPIO34 (ADC)</text>
            <text x="30" y="264" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">GND</text>

            <line x1="160" y1="80" x2="215" y2="80" stroke="#C2934B" strokeWidth="1.5" />
            <rect x="215" y="60" width="110" height="44" fill="none" stroke="#C2934B" strokeWidth="1.5" />
            <text x="225" y="78" fontSize="9" fontWeight="600" fontFamily="JetBrains Mono, monospace" fill="#C2934B">PC817 OPTO</text>
            <text x="225" y="92" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">ISOLATED PTT</text>
            <line x1="325" y1="80" x2="390" y2="80" stroke="#C2934B" strokeWidth="1.5" />

            <line x1="160" y1="140" x2="220" y2="140" stroke="#15803D" strokeWidth="1.5" />
            <line x1="220" y1="128" x2="220" y2="152" stroke="#15803D" strokeWidth="2" />
            <line x1="228" y1="128" x2="228" y2="152" stroke="#15803D" strokeWidth="2" />
            <text x="208" y="122" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#15803D">10uF</text>
            <line x1="228" y1="140" x2="275" y2="140" stroke="#15803D" strokeWidth="1.5" />
            <rect x="275" y="131" width="44" height="18" fill="none" stroke="#15803D" strokeWidth="1.2" />
            <text x="284" y="143" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#15803D">10k</text>
            <line x1="319" y1="140" x2="390" y2="140" stroke="#15803D" strokeWidth="1.5" />
            <line x1="340" y1="140" x2="340" y2="174" stroke="#6E6D68" strokeWidth="1" />
            <line x1="331" y1="174" x2="349" y2="174" stroke="#6E6D68" strokeWidth="1.2" />
            <line x1="334" y1="178" x2="346" y2="178" stroke="#6E6D68" strokeWidth="1.2" />
            <line x1="337" y1="182" x2="343" y2="182" stroke="#6E6D68" strokeWidth="1.2" />
            <text x="346" y="166" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">1k GND</text>

            <line x1="160" y1="210" x2="250" y2="210" stroke="#B45309" strokeWidth="1.5" />
            <line x1="250" y1="198" x2="250" y2="222" stroke="#B45309" strokeWidth="2" />
            <line x1="258" y1="198" x2="258" y2="222" stroke="#B45309" strokeWidth="2" />
            <text x="238" y="192" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#B45309">10uF</text>
            <line x1="258" y1="210" x2="390" y2="210" stroke="#B45309" strokeWidth="1.5" />
            <text x="170" y="230" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">1.65V ADC BIAS</text>

            <line x1="160" y1="260" x2="390" y2="260" stroke="#6E6D68" strokeWidth="1.5" />

            <rect x="390" y="24" width="130" height="260" fill="none" stroke="#3D3D3A" strokeWidth="1.5" className="dark:stroke-[#F2F0EA]" />
            <text x="400" y="44" fontSize="10" fontWeight="700" fontFamily="JetBrains Mono, monospace" fill="#3D3D3A" className="dark:fill-[#F2F0EA]">
              VHF HANDHELD
            </text>
            <text x="400" y="84" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#C2934B">PTT_SW</text>
            <text x="400" y="144" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#15803D">MIC_IN</text>
            <text x="400" y="214" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#B45309">SPK_OUT</text>
            <text x="400" y="264" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#6E6D68">GND</text>
          </svg>
        </div>

        <div className="xl:col-span-7 rounded-xl border border-[#E7E6E2] dark:border-[#2A2A28] bg-white dark:bg-[#181817] p-4 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[13px] font-semibold">Firmware Repository</h2>
              <p className="text-[11px] font-mono text-[#8A8984]">{currentFw.lang}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] px-2.5 py-1 text-xs hover:border-[#C2934B] cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-[#15803D]" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={handleDownloadFirmware}
                className="inline-flex items-center gap-1 rounded-lg bg-[#1A1A19] dark:bg-[#F2F0EA] text-white dark:text-[#111110] px-2.5 py-1 text-xs font-medium cursor-pointer"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                Download
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#F4F4F2] dark:bg-[#222220] p-0.5" role="tablist" aria-label="Firmware source files">
            {(
              [
                { id: 'screech', label: 'screech_tx_node.ino' },
                { id: 'truck', label: 'postman_truck_mule.ino' },
                { id: 'pi', label: 'mailbox_daemon.py' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeFw === tab.id}
                onClick={() => setActiveFw(tab.id)}
                className={`py-1.5 px-2 rounded-md text-[11px] font-mono truncate cursor-pointer transition-colors ${
                  activeFw === tab.id
                    ? 'bg-white dark:bg-[#181817] text-[#1A1A19] dark:text-[#F2F0EA] font-medium shadow-xs'
                    : 'text-[#6E6D68] hover:text-[#1A1A19] dark:hover:text-[#F2F0EA]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <pre className="rounded-lg border border-[#E7E6E2] dark:border-[#2A2A28] bg-[#F9F9F8] dark:bg-[#141413] p-3 max-h-[280px] overflow-auto font-mono text-[11px] leading-relaxed">
            <code>{currentFw.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
