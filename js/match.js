// Éléfiches — comparaison des réponses et fabrication des phrases à trous.
// Aucune dépendance : ce module est testé seul dans tests/engine.test.mjs.

export function norm(s) {
  return String(s ?? '').normalize('NFC').toLowerCase()
    .replace(/[’`´]/g, "'").replace(/…|\.\.\./g, ' ')
    .replace(/[.!?;:,]+$/g, '').replace(/\s+/g, ' ').trim();
}

export function noAcc(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

const ARTICLE = /^(?:(?:de la|de l'|un|une|des|le|la|les|du|the|an|a|to|el|los|las|una|unos|unas)\s+|l')/;

// Retire l'article initial, sauf si le mot entier est un article (fiche « Le »).
export function noArt(s) {
  const r = s.replace(ARTICLE, '').trim();
  return r || s;
}

// Formes acceptées pour une fiche : « Un patron / une patronne », « Être recruté(e) », « En (durée) ».
export function variants(word) {
  const out = new Set();
  for (let part of String(word).split(/\s+\/\s+/)) {
    const base = part.replace(/\s\([^)]*\)/g, '').trim();   // glose entre parenthèses
    if (/\([^)\s]+\)/.test(base)) {                          // suffixe facultatif collé : (e)
      out.add(norm(base.replace(/\(([^)\s]+)\)/g, '')));
      out.add(norm(base.replace(/\(([^)\s]+)\)/g, '$1')));
    } else out.add(norm(base));
  }
  out.delete('');
  return [...out];
}

// Mots-noyaux d'une fiche, sans article : servent à repérer le mot dans les exemples.
export function heads(word) {
  return [...new Set(variants(word).map(noArt))];
}

function lev1(a, b) {                       // vrai si la distance d'édition vaut 1 au plus
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

// Compare une réponse écrite aux formes acceptées.
// ok:true + note 'accent' ou 'article' : accepté et signalé, comme décidé au cahier des charges.
export function check(input, accepted) {
  const a = norm(input);
  if (!a) return { ok: false, empty: true };
  const acc = accepted.map(norm);
  if (acc.includes(a)) return { ok: true };
  const a2 = noAcc(a);
  if (acc.some(v => noAcc(v) === a2)) return { ok: true, note: 'accent' };
  const a3 = noArt(a2);
  if (acc.some(v => noArt(noAcc(v)) === a3)) return { ok: true, note: a2 === a ? 'article' : 'accent' };
  if (acc.some(v => v.length >= 5 && lev1(noAcc(v), a2))) return { ok: false, near: true };
  return { ok: false };
}

// ---------- Phrases à trous ----------

const TOK = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;
const ELISION = /^(?:l|d|j|qu|n|s|m|t|c|lorsqu|puisqu)'/;
const ELIDABLE = { de: "d'", le: "l'", la: "l'", que: "qu'", je: "j'", ne: "n'", se: "s'", me: "m'", te: "t'", ce: "c'" };

function tokens(s) {
  const t = s.replace(/[’`´]/g, "'");
  return [...t.matchAll(TOK)].map(m => ({ t: m[0], i: m.index }));
}

const key = s => noAcc(s.toLowerCase());

function sameWord(s, h, strict) {
  if (strict) return s.toLowerCase() === h.toLowerCase();
  const a = key(s), b = key(h);
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  return p >= Math.max(4, Math.ceil(b.length * 0.6)) && a.length - p <= 4 && b.length - p <= 3;
}

// Renvoie {off, len} si le mot de la phrase correspond au mot-noyau, sinon null.
function tokMatch(sTok, h, strict) {
  if (sameWord(sTok, h, strict)) return { off: 0, len: sTok.length };
  const m = sTok.toLowerCase().match(ELISION);
  if (m && sameWord(sTok.slice(m[0].length), h, strict)) return { off: m[0].length, len: sTok.length - m[0].length };
  const el = ELIDABLE[key(h)];
  if (el && sTok.toLowerCase().startsWith(el)) return { off: 0, len: el.length };
  return null;
}

function findRun(T, hs, from, strict) {
  for (let i = from; i + hs.length <= T.length; i++) {
    const ms = hs.map((h, j) => tokMatch(T[i + j].t, h, strict));
    if (ms.every(Boolean)) {
      const last = T[i + hs.length - 1], ml = ms[ms.length - 1];
      return { start: T[i].i + ms[0].off, end: last.i + ml.off + ml.len, next: i + hs.length, n: hs.length };
    }
  }
  return null;
}

function findRunAny(T, hs, from) {
  return findRun(T, hs, from, true) || findRun(T, hs, from, false);
}

// Cherche le mot de la fiche dans une phrase d'exemple.
export function findSpans(sentence, word) {
  const T = tokens(sentence);
  const raw = String(word).split(/\s+\/\s+/);
  for (const part of raw) {
    const base = part.replace(/\s\([^)]*\)/g, '').replace(/\(([^)\s]+)\)/g, '').trim();
    if (/…|\.\.\./.test(base)) {                         // forme discontinue : « De… à… »
      const pieces = base.split(/…|\.\.\./).map(p => norm(p)).filter(Boolean);
      const spans = []; let from = 0, ok = true;
      for (const p of pieces) {
        const r = findRunAny(T, p.split(' '), from);
        if (!r) { ok = false; break; }
        spans.push({ start: r.start, end: r.end }); from = r.next;
      }
      if (ok && spans.length) return { spans, multi: true, n: spans.length };
      continue;
    }
    const hs = noArt(norm(base)).split(' ');
    const r = findRunAny(T, hs, 0);
    if (r) return { spans: [{ start: r.start, end: r.end }], multi: false, n: r.n };
  }
  // Repli pour les expressions : on ne masque que le mot le plus long (« soif » dans « J'ai soif »).
  for (const part of raw) {
    const hs = heads(part).flatMap(h => h.split(' ')).filter(h => h.length >= 3).sort((a, b) => b.length - a.length);
    for (const h of hs) {
      const r = findRunAny(T, [h], 0);
      if (r) return { spans: [{ start: r.start, end: r.end }], multi: false, n: 1 };
    }
  }
  return null;
}

// Toutes les phrases à trous possibles pour une fiche.
export function clozes(card) {
  const out = [];
  for (const ex of card.examples || []) {
    const f = findSpans(ex, card.word);
    if (!f) continue;
    const s = ex.replace(/[’`´]/g, "'");
    const answer = f.spans.map(sp => s.slice(sp.start, sp.end)).join(' … ');
    out.push({ text: s, spans: f.spans, answer, multi: f.multi, n: f.n });
  }
  return out;
}

// Découpe une phrase à trous en morceaux affichables : [{text}|{blank:true}]
export function clozeParts(cl) {
  const parts = []; let pos = 0;
  for (const sp of cl.spans) {
    if (sp.start > pos) parts.push({ text: cl.text.slice(pos, sp.start) });
    parts.push({ blank: true, text: cl.text.slice(sp.start, sp.end) });
    pos = sp.end;
  }
  if (pos < cl.text.length) parts.push({ text: cl.text.slice(pos) });
  return parts;
}
