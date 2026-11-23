// Éléfiches — lecture d'une archive ZIP dans le navigateur, sans bibliothèque.
// Sert à importer en un seul fichier un paquet et ses images (formats « stocké » et « deflate »).
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm' };
export const typeOf = name => TYPES[(String(name).match(/\.(\w+)$/) || [])[1]?.toLowerCase()] || '';

export async function unzip(buffer) {
  const u8 = new Uint8Array(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let end = u8.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;      // fin du répertoire central
  if (end < 0) throw new Error('zip');
  const count = dv.getUint16(end + 10, true), out = [];
  let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < count && dv.getUint32(p, true) === 0x02014b50; i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || /(^|\/)(__MACOSX\/|\.)/.test(name)) continue;   // dossiers et fichiers cachés
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = u8.slice(start, start + size), type = typeOf(name);
    let blob;
    if (method === 0) blob = new Blob([data], { type });
    else if (method === 8) blob = new Blob([await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()], { type });
    else continue;
    out.push({ name, blob });
  }
  return out;
}
