import { inflateSync } from 'node:zlib';

/** Text shown by every `(...) Tj` in the PDF's content streams, inflating them when compressed. */
export function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = Buffer.from(m[1], 'latin1');
    try {
      body = inflateSync(body);
    } catch {
      /* stream was not compressed */
    }
    // pdf-lib writes shown text as a hex string; accept a literal string too.
    for (const t of body.toString('latin1').matchAll(/<([0-9a-fA-F\s]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
      out.push(t[1] !== undefined ? Buffer.from(t[1].replace(/\s/g, ''), 'hex').toString('latin1') : t[2].replace(/\\(.)/g, '$1'));
    }
  }
  return out.join('\n');
}
