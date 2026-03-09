import crypto from 'crypto';

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function perceptualHashImage(buffer: Buffer): Promise<string | null> {
  try {
    const sharp = (await import('sharp')).default;
    const { data } = await sharp(buffer)
      .resize(8, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    const bits = pixels.map(p => (p >= avg ? '1' : '0')).join('');
    const hex = bits.match(/.{4}/g)!.map(b => parseInt(b, 2).toString(16)).join('');
    return hex;
  } catch {
    return null;
  }
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  const aBin = BigInt('0x' + a).toString(2).padStart(64, '0');
  const bBin = BigInt('0x' + b).toString(2).padStart(64, '0');
  for (let i = 0; i < aBin.length; i++) {
    if (aBin[i] !== bBin[i]) dist++;
  }
  return dist;
}
