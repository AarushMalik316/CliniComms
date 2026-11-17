/**
 * Genuine GF(2^8) Reed-Solomon Forward Error Correction Engine
 * Primitive polynomial: 0x11D (x^8 + x^4 + x^3 + x^2 + 1)
 * Supports systematic encoding with N_SYM = 8 parity bytes,
 * Berlekamp-Massey error locator, Chien search, and Forney error+erasure correction.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

export function gfAdd(a: number, b: number): number {
  return a ^ b;
}

export function gfSub(a: number, b: number): number {
  return a ^ b;
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('GF(2^8) division by zero');
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

export function gfPow(x: number, power: number): number {
  if (power === 0) return 1;
  if (x === 0) return 0;
  const p = ((GF_LOG[x] * power) % 255 + 255) % 255;
  return GF_EXP[p];
}

export function gfInverse(x: number): number {
  if (x === 0) throw new Error('GF(2^8) inverse of zero');
  return GF_EXP[255 - GF_LOG[x]];
}

function gfPolyScale(p: Uint8Array, x: number): Uint8Array {
  const res = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) {
    res[i] = gfMul(p[i], x);
  }
  return res;
}

function gfPolyAdd(p: Uint8Array, q: Uint8Array): Uint8Array {
  const len = Math.max(p.length, q.length);
  const res = new Uint8Array(len);
  for (let i = 0; i < p.length; i++) {
    res[i + len - p.length] = p[i];
  }
  for (let i = 0; i < q.length; i++) {
    res[i + len - q.length] ^= q[i];
  }
  return res;
}

function gfPolyMul(p: Uint8Array, q: Uint8Array): Uint8Array {
  const res = new Uint8Array(p.length + q.length - 1);
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      res[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return res;
}

function gfPolyEval(poly: Uint8Array, x: number): number {
  let y = poly[0];
  for (let i = 1; i < poly.length; i++) {
    y = gfMul(y, x) ^ poly[i];
  }
  return y;
}

export function rsGeneratorPoly(nsym: number): Uint8Array {
  let g: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < nsym; i++) {
    g = gfPolyMul(g, new Uint8Array([1, gfPow(2, i)]));
  }
  return g;
}

/**
 * Systematic Reed-Solomon encoding.
 * Returns [message (k bytes), parity (nsym bytes)].
 */
export function rsEncode(msg: Uint8Array, nsym = 8): Uint8Array {
  if (msg.length + nsym > 255) {
    throw new Error('Reed-Solomon codeword length cannot exceed 255 bytes');
  }
  const gen = rsGeneratorPoly(nsym);
  const out = new Uint8Array(msg.length + nsym);
  out.set(msg, 0);

  for (let i = 0; i < msg.length; i++) {
    const coef = out[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        out[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  out.set(msg, 0);
  return out;
}

export function rsCalcSyndromes(msg: Uint8Array, nsym = 8): Uint8Array {
  const synd = new Uint8Array(nsym + 1);
  synd[0] = 0;
  for (let i = 0; i < nsym; i++) {
    synd[i + 1] = gfPolyEval(msg, gfPow(2, i));
  }
  return synd;
}

function rsFindErrdataLocator(ePos: number[]): Uint8Array {
  let eLoc: Uint8Array = new Uint8Array([1]);
  for (const i of ePos) {
    eLoc = gfPolyMul(eLoc, gfPolyAdd(new Uint8Array([1]), new Uint8Array([gfPow(2, i), 0])));
  }
  return eLoc;
}

function rsFindErrorEvaluator(synd: Uint8Array, errLoc: Uint8Array, nsym: number): Uint8Array {
  const revSynd = new Uint8Array(synd.length);
  for (let i = 0; i < synd.length; i++) {
    revSynd[i] = synd[synd.length - 1 - i];
  }
  const prod = gfPolyMul(revSynd, errLoc);
  const remainder = prod.slice(prod.length - (nsym + 1));
  return remainder;
}

function rsForneySyndromes(synd: Uint8Array, pos: number[], nmess: number): Uint8Array {
  const erasePosReversed = pos.map((p) => nmess - 1 - p);
  let fsynd = synd.slice(1); // drop leading 0
  for (let i = 0; i < erasePosReversed.length; i++) {
    const x = gfPow(2, erasePosReversed[i]);
    for (let j = 0; j < fsynd.length - 1; j++) {
      fsynd[j] = gfMul(fsynd[j], x) ^ fsynd[j + 1];
    }
  }
  return fsynd;
}

function rsFindErrorLocator(synd: Uint8Array, nsym: number, eraseLoc?: Uint8Array, eraseCount = 0): Uint8Array | null {
  let errLoc: Uint8Array = eraseLoc ? new Uint8Array(eraseLoc) : new Uint8Array([1]);
  let oldLoc: Uint8Array = eraseLoc ? new Uint8Array(eraseLoc) : new Uint8Array([1]);

  const syndShift = synd.length > nsym ? synd.length - nsym : 0;

  for (let i = 0; i < nsym - eraseCount; i++) {
    const K = i + syndShift;
    let delta = synd[K];
    for (let j = 1; j < errLoc.length; j++) {
      delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[K - j]);
    }

    const shiftedOld = new Uint8Array(oldLoc.length + 1);
    shiftedOld.set(oldLoc, 0);
    oldLoc = shiftedOld;

    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = gfPolyScale(oldLoc, delta);
        oldLoc = gfPolyScale(errLoc, gfInverse(delta));
        errLoc = newLoc;
      }
      errLoc = gfPolyAdd(errLoc, gfPolyScale(oldLoc, delta));
    }
  }

  let drop = 0;
  while (drop < errLoc.length && errLoc[drop] === 0) drop++;
  errLoc = errLoc.slice(drop);
  const errs = errLoc.length - 1;
  if ((errs - eraseCount) * 2 + eraseCount > nsym) {
    return null;
  }
  return errLoc;
}

function rsFindErrors(errLoc: Uint8Array, nmess: number): number[] | null {
  const errs = errLoc.length - 1;
  const errPos: number[] = [];
  for (let i = 0; i < nmess; i++) {
    if (gfPolyEval(errLoc, gfPow(2, i)) === 0) {
      errPos.push(nmess - 1 - i);
    }
  }
  if (errPos.length !== errs) {
    return null;
  }
  return errPos;
}

function rsCorrectErrdata(msgIn: Uint8Array, synd: Uint8Array, errPos: number[]): Uint8Array | null {
  const coefPos = errPos.map((p) => msgIn.length - 1 - p);
  const errLoc = rsFindErrdataLocator(coefPos);
  const errEval = rsFindErrorEvaluator(synd, errLoc, errLoc.length - 1);

  const X: number[] = [];
  for (const pos of coefPos) {
    const l = 255 - pos;
    X.push(gfPow(2, -l));
  }

  const E = new Uint8Array(msgIn.length);
  const Xlength = X.length;
  for (let i = 0; i < Xlength; i++) {
    const Xi = X[i];
    const XiInv = gfInverse(Xi);

    let errLocPrime = 1;
    for (let j = 0; j < Xlength; j++) {
      if (j !== i) {
        errLocPrime = gfMul(errLocPrime, gfSub(1, gfMul(XiInv, X[j])));
      }
    }
    if (errLocPrime === 0) return null;

    let y = gfPolyEval(errEval, XiInv);
    y = gfMul(gfPow(Xi, 1), y);
    const magnitude = gfDiv(y, errLocPrime);
    E[errPos[i]] = magnitude;
  }

  const corrected = new Uint8Array(msgIn.length);
  for (let i = 0; i < msgIn.length; i++) {
    corrected[i] = msgIn[i] ^ E[i];
  }
  return corrected;
}

export interface RsDecodeResult {
  success: boolean;
  repaired: Uint8Array;
  message: Uint8Array;
  correctedIndices: number[];
  syndromes: number[];
  errorCount: number;
  reason?: string;
}

/**
 * Decodes and repairs a systematic RS codeword.
 * Supports up to floor(nsym/2) random errors or up to nsym erasures (2*errors + erasures <= nsym).
 */
export function rsDecode(
  codeword: Uint8Array,
  nsym = 8,
  erasureIndices: number[] = []
): RsDecodeResult {
  const msgIn = new Uint8Array(codeword);
  const synd = rsCalcSyndromes(msgIn, nsym);
  const syndArr = Array.from(synd.slice(1));

  if (syndArr.every((s) => s === 0)) {
    return {
      success: true,
      repaired: msgIn,
      message: msgIn.slice(0, msgIn.length - nsym),
      correctedIndices: [],
      syndromes: syndArr,
      errorCount: 0,
    };
  }

  const validErasures = Array.from(
    new Set(erasureIndices.filter((idx) => idx >= 0 && idx < msgIn.length))
  );

  if (validErasures.length > nsym) {
    return {
      success: false,
      repaired: msgIn,
      message: msgIn.slice(0, msgIn.length - nsym),
      correctedIndices: [],
      syndromes: syndArr,
      errorCount: -1,
      reason: `Erasure count (${validErasures.length}) exceeds parity capacity (${nsym})`,
    };
  }

  const fsynd = rsForneySyndromes(synd, validErasures, msgIn.length);
  const fsyndWithZero = new Uint8Array(fsynd.length + 1);
  fsyndWithZero.set(fsynd, 1);

  const eraseLoc =
    validErasures.length > 0
      ? rsFindErrdataLocator(validErasures.map((p) => msgIn.length - 1 - p))
      : undefined;

  const errLoc = rsFindErrorLocator(fsyndWithZero, nsym, eraseLoc, validErasures.length);
  if (!errLoc) {
    return {
      success: false,
      repaired: msgIn,
      message: msgIn.slice(0, msgIn.length - nsym),
      correctedIndices: [],
      syndromes: syndArr,
      errorCount: -1,
      reason: 'Errors exceed Reed-Solomon locator capacity',
    };
  }

  const revErrLoc = new Uint8Array(errLoc.length);
  for (let i = 0; i < errLoc.length; i++) {
    revErrLoc[i] = errLoc[errLoc.length - 1 - i];
  }

  const errPos = rsFindErrors(revErrLoc, msgIn.length);
  if (!errPos) {
    return {
      success: false,
      repaired: msgIn,
      message: msgIn.slice(0, msgIn.length - nsym),
      correctedIndices: [],
      syndromes: syndArr,
      errorCount: -1,
      reason: 'Chien search failed to locate all error roots',
    };
  }

  const allPos = Array.from(new Set([...validErasures, ...errPos])).sort((a, b) => a - b);
  const corrected = rsCorrectErrdata(msgIn, synd, allPos);
  if (!corrected) {
    return {
      success: false,
      repaired: msgIn,
      message: msgIn.slice(0, msgIn.length - nsym),
      correctedIndices: [],
      syndromes: syndArr,
      errorCount: -1,
      reason: 'Forney error evaluator produced singular root',
    };
  }

  const verifySynd = rsCalcSyndromes(corrected, nsym);
  const verifyOk = verifySynd.slice(1).every((s) => s === 0);
  if (!verifyOk) {
    return {
      success: false,
      repaired: msgIn,
      message: msgIn.slice(0, msgIn.length - nsym),
      correctedIndices: [],
      syndromes: syndArr,
      errorCount: -1,
      reason: 'Post-correction syndrome check failed (uncorrectable burst)',
    };
  }

  const actuallyChanged = allPos.filter((idx) => corrected[idx] !== codeword[idx]);

  return {
    success: true,
    repaired: corrected,
    message: corrected.slice(0, corrected.length - nsym),
    correctedIndices: actuallyChanged,
    syndromes: syndArr,
    errorCount: actuallyChanged.length,
  };
}
