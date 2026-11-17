import React from 'react';
import {
  ByteHealth,
  DecodedFrameResult,
  FRAME_SIZE,
  formatHexByte,
} from '@/src/lib/protocol/frame';

interface HexMatrixInspectorProps {
  txFrame: Uint8Array | null;
  decoded: DecodedFrameResult | null;
}

const BYTE_FIELD_LABELS: Array<{ range: [number, number]; label: string }> = [
  { range: [0, 1], label: 'PRE' },
  { range: [2, 2], label: 'SYNC' },
  { range: [3, 3], label: 'TYPE' },
  { range: [4, 5], label: 'NODE' },
  { range: [6, 9], label: 'TIME' },
  { range: [10, 17], label: 'DATA' },
  { range: [18, 19], label: 'CRC' },
  { range: [20, 27], label: 'FEC' },
];

function getFieldTag(index: number): string {
  for (const item of BYTE_FIELD_LABELS) {
    if (index >= item.range[0] && index <= item.range[1]) return item.label;
  }
  return 'DATA';
}

function getHealthClasses(health: ByteHealth): string {
  switch (health) {
    case 'REPAIRED':
      return 'border-[#008A52] bg-[#008A52]/10 text-[#008A52] font-semibold';
    case 'DAMAGED':
      return 'border-[#D97706] bg-[#D97706]/10 text-[#D97706] font-semibold';
    case 'UNRECOVERABLE':
      return 'border-[#C81E1E] bg-[#C81E1E]/10 text-[#C81E1E] font-semibold';
    default:
      return 'border-[#DFDDD6] dark:border-[#2A2A28] bg-white dark:bg-[#181817] text-[#141413] dark:text-[#F2F0EA]';
  }
}

export const HexMatrixInspector: React.FC<HexMatrixInspectorProps> = ({
  txFrame,
  decoded,
}) => {
  const bytes = decoded?.repairedBytes ?? txFrame;

  return (
    <div className="p-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[#DFDDD6] dark:border-[#2A2A28] pb-1.5">
        <div>
          <h3 className="text-[11px] font-mono font-semibold tracking-wider text-[#141413] dark:text-[#F2F0EA]">
            28-BYTE HEX &amp; REED-SOLOMON FEC MATRIX
          </h3>
          <p className="text-[10px] font-mono text-[#6E6D68]">
            GF(2^8) 0x11D · 8-SYMBOL PARITY · CRC-16 (0x1021)
          </p>
        </div>
        {decoded && (
          <div className="text-right font-mono text-[10px] tabular-nums">
            <span
              className={
                decoded.valid
                  ? 'text-[#008A52] font-semibold'
                  : 'text-[#C81E1E] font-semibold'
              }
            >
              {decoded.valid
                ? decoded.repairedByteCount > 0
                  ? `FEC REPAIRED (${decoded.repairedByteCount}B) · CRC VALID`
                  : 'INTACT FRAME · CRC VALID'
                : 'CRC-16 REJECTED · UNRECOVERABLE'}
            </span>
          </div>
        )}
      </div>

      {!bytes ? (
        <div className="border border-dashed border-[#DFDDD6] dark:border-[#2A2A28] p-6 text-center font-mono text-xs text-[#6E6D68]">
          Transmit a 28-byte packet to inspect real-time byte encoding, channel static mutations, and GF(2^8) syndrome reconstruction.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1" data-testid="hex-matrix-grid">
            {Array.from({ length: FRAME_SIZE }).map((_, idx) => {
              const health: ByteHealth = decoded ? decoded.byteHealth[idx] : 'INTACT';
              const finalVal = bytes[idx];
              const rawRxVal = decoded?.rawBytes[idx];
              const wasCorruptedBeforeRepair =
                decoded !== null && rawRxVal !== undefined && rawRxVal !== finalVal;

              return (
                <div
                  key={idx}
                  title={`Byte ${idx.toString().padStart(2, '0')} (${getFieldTag(idx)}) — ${health}`}
                  className={`border p-1 font-mono transition-colors ${getHealthClasses(health)}`}
                >
                  <div className="flex items-center justify-between gap-0.5 text-[8px] text-[#6E6D68]">
                    <span>{idx.toString().padStart(2, '0')}</span>
                    <span>{getFieldTag(idx)}</span>
                  </div>
                  <div className="text-xs font-semibold tracking-tight mt-0.5 tabular-nums">
                    {formatHexByte(finalVal)}
                  </div>
                  <div className="text-[9px] mt-0.5 tabular-nums truncate">
                    {wasCorruptedBeforeRepair ? (
                      <span className="line-through text-[#C81E1E] mr-1">
                        {formatHexByte(rawRxVal!)}
                      </span>
                    ) : (
                      <span className="text-[#6E6D68]">
                        {finalVal.toString(2).padStart(8, '0').slice(0, 4)}..
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#6E6D68] pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <span>INTACT: {FRAME_SIZE - (decoded?.repairedByteCount ?? 0) - (decoded?.damagedByteCount ?? 0)}B</span>
              <span className="text-[#008A52]">FEC REPAIRED: {decoded?.repairedByteCount ?? 0}B</span>
              <span className="text-[#C81E1E]">DAMAGED: {decoded?.damagedByteCount ?? 0}B</span>
            </div>
            {decoded && (
              <div className="tabular-nums">
                CRC RX: 0x{decoded.receivedCrc.toString(16).padStart(4, '0').toUpperCase()} / CALC: 0x
                {decoded.calculatedCrc.toString(16).padStart(4, '0').toUpperCase()}
              </div>
            )}
          </div>

          {decoded && (
            <div className="border border-[#DFDDD6] dark:border-[#2A2A28] bg-[#F6F5F0] dark:bg-[#111110] p-2.5 font-mono text-[11px] space-y-1">
              <div className="flex items-center justify-between text-[#6E6D68]">
                <span>GF(2^8) SYNDROME VECTOR (S0..S7)</span>
                <span>{decoded.syndromes.every((s) => s === 0) ? 'ZERO SYNDROME' : 'ERRORS DETECTED'}</span>
              </div>
              <div className="text-[#141413] dark:text-[#F2F0EA] tabular-nums">
                [{decoded.syndromes.map((s) => formatHexByte(s)).join(' ')}]
              </div>
              {decoded.failureReason && (
                <div className="text-[#C81E1E] font-medium pt-1">
                  REJECTED: {decoded.failureReason}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
