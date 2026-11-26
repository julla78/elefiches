// Éléfiches — comparaison des réponses et fabrication des phrases à trous.
// Aucune dépendance : ce module est testé seul dans tests/engine.test.mjs.

// Même nettoyage que norm, mais la casse est gardée : elle sert à reconnaître un accent absent d'une majuscule.
// La ponctuation finale est retirée par une boucle, pas par une expression régulière : sur un très long texte plein
// de ponctuation (paquet hostile), « [.!?;:,]+$ » coûtait un temps quadratique et figeait l'appli.
function clean(s) {
  const t = String(s ?? '').normalize('NFC').replace(/[’`´]/g, "'").replace(/…|\.\.\./g, ' ');
  let n = t.length;
  while (n && '.!?;:,'.includes(t[n - 1])) n--;
  return t.slice(0, n).replace(/\s+/g, ' ').trim();
}
export function norm(s) {
  return clean(s).toLowerCase();
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

// Lettre par lettre : la lettre nue, la lettre telle qu'elle est écrite, si elle a été tapée en majuscule et si elle
// commence un mot. « œ » et « æ » comptent pour deux lettres, afin de s'aligner sur « oe » et « ae ».
function letters(s) {
  const out = []; let first = true;
  for (const ch of s) {
    const low = ch.toLowerCase(), base = noAcc(low), up = ch !== low;
    if (base.length === 1) out.push({ b: base, c: low, up, first });
    else for (const b of base) out.push({ b, c: low, up, first, lig: true });
    first = !/[\p{L}\p{M}\p{N}]/u.test(ch);
  }
  return out;
}
// Nature de l'écart quand les lettres nues sont les mêmes et que seule leur écriture diffère.
//   ''       : rien à reprocher. Ne sont pas comptés : un accent, un tréma ou une cédille absents de la majuscule qui
//              commence un mot (« Ecole », « Ca va », « A bientôt » : usage courant, touches rares), et « œ » tapé là
//              où le paquet écrit « oe ». Tout écrire en majuscules ne dispense donc pas des accents (« ECOLE » ne
//              passe que pour son É), et « ñ », lettre à part entière, est exigé même en majuscule ;
//   'accent' : accent aigu, grave ou circonflexe manquant, en trop ou confondu ;
//   sinon, la lettre attendue elle-même (« ç », « ñ », « œ », « ë »…), pour que le message puisse la nommer.
// Les deux textes sont alignés par la fin : un article oublié au début ne décale rien.
export function slip(typed, expected) {
  const A = letters(clean(typed)), B = letters(norm(expected));
  let kind = '';
  for (let i = 1; i <= Math.min(A.length, B.length); i++) {
    const a = A[A.length - i], b = B[B.length - i];
    if (a.b !== b.b) break;
    if (a.c === b.c || (a.lig && !b.lig && b.c === b.b)) continue;          // « sœur » tapé pour un paquet qui écrit « soeur » : l'étudiant n'a pas tort (mais « nœl » n'est pas « noël »)
    const marks = (b.c + a.c).normalize('NFD').replace(/[a-z]/g, '');
    if (a.up && a.first && a.c === a.b && !b.lig && !marks.includes('\u0303')) continue;   // majuscule initiale sans son accent
    const plain = /^[\u0300-\u0302]*$/.test(marks) && !a.lig && !b.lig;
    if (!plain) return b.c !== b.b ? b.c : a.c;
    kind = 'accent';
  }
  return kind;
}

const OPENING = /[¿¡]/g, HAS_OPENING = /[¿¡]/;

// Compare une réponse écrite aux formes acceptées.
//   ok:true                 : la forme exacte (casse et ponctuation finale à part) ;
//   ok:true, note 'article' : le bon mot, sans son article ou avec un autre ;
//   ok:true, note 'open'    : il ne manque que le signe qui ouvre une question ou une exclamation en espagnol ;
//   ok:true, note 'accent'  : les bonnes lettres, mais un accent ou un signe à revoir (slip dit lequel). C'est à
//                             l'appelant de décider ce qu'il en fait : voir judge, dans session.js ;
//   ok:false, near:true     : une lettre d'écart.
export function check(input, accepted, minNear = 5) {
  const typed = clean(input).replace(OPENING, '').trim(), a = typed.toLowerCase();
  if (!a) return { ok: false, empty: true };
  const strip = v => norm(v).replace(OPENING, '').trim(), acc = accepted.map(strip);
  // Le rappel du signe d'ouverture (« ¿ », « ¡ ») ne vaut que si la forme reconnue en porte un dans la fiche.
  const signless = new Set(accepted.filter(v => !HAS_OPENING.test(String(v))).map(strip)), bare1 = !HAS_OPENING.test(String(input));
  const fine = (forms, note) => (note ? { ok: true, note } : bare1 && forms.every(v => !signless.has(v)) ? { ok: true, note: 'open' } : { ok: true });
  if (acc.includes(a)) return fine([a]);
  const a2 = noAcc(a);
  const same = acc.filter(v => noAcc(v) === a2);
  if (same.length) {
    const kinds = same.map(v => slip(typed, v));
    return kinds.includes('') ? fine(same.filter((v, i) => kinds[i] === '')) : { ok: true, note: 'accent', slip: kinds[0] };
  }
  // L'article est retiré avant les accents : « à » n'est pas l'article anglais « a » (« côté » n'est pas « à côté »).
  const bareOf = v => noAcc(noArt(v)), a3 = bareOf(a);
  const bare = acc.filter(v => bareOf(v) === a3);
  if (bare.length) {
    const kinds = bare.map(v => slip(typed, v));
    return kinds.includes('') ? fine(bare, 'article') : { ok: true, note: 'accent', slip: kinds[0] };
  }
  // Une lettre d'écart, avec ou sans l'article (« chot » pour « un chat »).
  if (acc.some(v => (v.length >= minNear && lev1(noAcc(v), a2)) || (bareOf(v).length >= minNear && lev1(bareOf(v), a3)))) return { ok: false, near: true };
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
// Si le paquet a marqué le mot dans l'exemple (« Mon dossier [stood out] parmi… »), cette marque fait foi :
// aucune devinette sur les formes conjuguées ou irrégulières. Sinon, le mot est cherché dans la phrase.
export function clozes(card) {
  const out = [];
  (card.examples || []).forEach((ex, i) => {
    const s = ex.replace(/[’`´]/g, "'"), m = card.marks?.[i];
    if (m && m[1] > m[0] && m[1] <= s.length) { out.push({ text: s, spans: [{ start: m[0], end: m[1] }], answer: s.slice(m[0], m[1]), multi: false, n: s.slice(m[0], m[1]).trim().split(/\s+/).length }); return; }
    const f = findSpans(ex, card.word);
    if (!f) return;
    const answer = f.spans.map(sp => s.slice(sp.start, sp.end)).join(' … ');
    out.push({ text: s, spans: f.spans, answer, multi: f.multi, n: f.n });
  });
  return out;
}
// Retire les crochets d'un exemple et renvoie la place du mot marqué : « Je paie un [loyer]. » → ['Je paie un loyer.', [11, 16]].
export function unmark(ex) {
  const m = ex.match(/\[([^\]]+)\]/);
  return m ? [ex.replace(/[\[\]]/g, ''), [m.index, m.index + m[1].length]] : [ex.replace(/[\[\]]/g, ''), null];
}
// Remet les crochets, pour l'éditeur et l'export.
export const remark = (ex, m) => (m ? ex.slice(0, m[0]) + '[' + ex.slice(m[0], m[1]) + ']' + ex.slice(m[1]) : ex);

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

// Met en évidence, dans la bonne orthographe, l'endroit où la réponse écrite s'en écartait.
export function diffParts(right, wrong) {
  let a = 0; while (a < right.length && a < wrong.length && right[a] === wrong[a]) a++;
  let b = 0; while (b < right.length - a && b < wrong.length - a && right[right.length - 1 - b] === wrong[wrong.length - 1 - b]) b++;
  let from = a, to = right.length - b;
  if (to <= from) { from = Math.max(0, from - 1); to = Math.min(right.length, to + 1); }   // lettre en trop : on montre l'endroit
  return [right.slice(0, from), right.slice(from, to), right.slice(to)];
}

// Ce que la voix doit dire : le mot sans ses précisions entre parenthèses ; « Petit / petite » se lit en deux temps,
// « Minuscule / minuscule » une seule fois.
export const spoken = word => [...new Map(word.replace(/\s*\([^)]*\)/g, '').replace(/…|\.{2,}/g, ' ').split(/\s\/\s/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).map(x => [x.toLowerCase(), x])).values()].join(', ');

// Nom de fichier sûr pour un lien : minuscules, sans accent, chiffres et tirets (« Week-end à Londres » → « week-end-a-londres »).
export const slug = text => noAcc(String(text).toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
