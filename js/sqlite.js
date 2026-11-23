// Éléfiches — lecture d'une base SQLite, sans bibliothèque : juste ce qu'il faut pour ouvrir un paquet Anki (.apkg).
// On lit des tables entières, ligne par ligne ; aucune requête, aucun index.
export function openSqlite(buffer) {
  const u8 = new Uint8Array(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (new TextDecoder().decode(u8.subarray(0, 15)) !== 'SQLite format 3') throw new Error('sqlite');
  const pageSize = dv.getUint16(16) === 1 ? 65536 : dv.getUint16(16), usable = pageSize - u8[20], text = new TextDecoder();
  const varint = p => {            // entier de longueur variable : [valeur, position suivante]
    let v = 0;
    for (let i = 0; i < 8; i++) { const b = u8[p++]; v = v * 128 + (b & 127); if (!(b & 128)) return [v, p]; }
    return [v * 256 + u8[p], p + 1];
  };
  // Contenu d'une ligne, y compris la partie rangée dans des pages de débordement.
  const payload = (p, size) => {
    const max = usable - 35;
    if (size <= max) return u8.subarray(p, p + size);
    const min = Math.floor((usable - 12) * 32 / 255) - 23, k = min + (size - min) % (usable - 4), local = k <= max ? k : min;
    const out = new Uint8Array(size); out.set(u8.subarray(p, p + local));
    let done = local, next = dv.getUint32(p + local);
    while (next && done < size) {
      const at = (next - 1) * pageSize, n = Math.min(usable - 4, size - done);
      out.set(u8.subarray(at + 4, at + 4 + n), done); done += n; next = dv.getUint32(at);
    }
    return out;
  };
  const record = bytes => {
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), types = [];
    const vi = p => { let v = 0; for (let i = 0; i < 9; i++) { const b = bytes[p++]; v = v * 128 + (b & 127); if (!(b & 128)) break; } return [v, p]; };
    let [hdr, p] = vi(0), q = hdr;
    while (p < hdr) { const [t, n] = vi(p); types.push(t); p = n; }
    return types.map(t => {
      if (t === 0) return null;
      if (t === 8) return 0;
      if (t === 9) return 1;
      if (t >= 12) { const n = (t - 12 - (t % 2)) / 2, v = bytes.subarray(q, q + n); q += n; return t % 2 ? text.decode(v) : v; }
      if (t === 7) { const v = d.getFloat64(q); q += 8; return v; }
      const n = [0, 1, 2, 3, 4, 6, 8][t]; let v = d.getInt8(q);
      for (let i = 1; i < n; i++) v = v * 256 + bytes[q + i];
      q += n; return v;
    });
  };
  const rows = (root, out = []) => {     // parcourt l'arbre d'une table et renvoie ses lignes
    const base = (root - 1) * pageSize, h = base + (root === 1 ? 100 : 0), kind = u8[h], n = dv.getUint16(h + 3);
    const cells = Array.from({ length: n }, (_, i) => base + dv.getUint16(h + (kind === 5 ? 12 : 8) + 2 * i));
    if (kind === 5) { for (const c of cells) rows(dv.getUint32(c), out); rows(dv.getUint32(h + 8), out); }
    else if (kind === 13) for (const c of cells) { const [size, p1] = varint(c), [rowid, p2] = varint(p1), r = record(payload(p2, size)); if (r[0] === null) r[0] = rowid; out.push(r); }   // « id integer primary key » : la valeur est le numéro de ligne
    return out;
  };
  const master = rows(1).filter(r => r[0] === 'table');      // type, nom, table, page racine, définition
  return { tables: master.map(r => r[1]), table: name => { const m = master.find(r => r[1] === name); return m ? rows(m[3]) : []; } };
}
