// Éléfiches — comparaison des réponses et fabrication des phrases à trous.
// Aucune dépendance : ce module est testé seul dans tests/engine.test.mjs.

// Même nettoyage que norm, mais la casse est gardée : elle sert à dire si un accent manque sur une majuscule.
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

const ARTICLE = /^(?:(?:de la|un|une|des|le|la|les|du|the|an|a|to|el|los|las|una|unos|unas)\s+|de l'|l')/;      // « de l'eau » : pas d'espace après l'apostrophe

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

// Lettre par lettre : la lettre nue, la lettre telle qu'elle est écrite (en minuscule) et si elle a été tapée en
// majuscule. « œ » et « æ » comptent pour deux lettres, afin de s'aligner sur « oe » et « ae ».
function letters(s) {
  const out = []; let pend = '';
  for (const ch of s) {
    const low = ch.toLowerCase(), base = noAcc(low), up = ch !== low;
    // Accent isolé, en trop : il s'ajoute à la lettre qui le porte (ou à la suivante s'il vient avant toute lettre), et se voit.
    if (!base.length) { if (out.length) out[out.length - 1].c += low; else pend += low; continue; }
    const at = out.length;
    if (base.length === 1) out.push({ b: base, c: low, up });
    else for (const b of base) out.push({ b, c: low, up, lig: true });
    if (pend) { out[at].c += pend; pend = ''; }
  }
  return out;
}
// Nature de l'écart quand les lettres nues sont les mêmes et que seule leur écriture diffère.
//   ''       : rien à reprocher. La casse ne compte pas (« école », « École » et « ÉCOLE » sont la même réponse), mais
//              une majuscule garde son accent, sa cédille ou son tilde : « Ecole » pour « école » est un écart, comme
//              « ecole » (décision du 26 novembre 2026 : aucune tolérance ; la rangée de touches a une touche « Maj »).
//              Seule exception : « œ » tapé là où le paquet écrit « oe » ;
//   'accent' : accent aigu, grave ou circonflexe manquant, en trop ou confondu ;
//   sinon, la lettre attendue elle-même (« ç », « ñ », « œ », « ë »…), pour que le message puisse la nommer.
// cap : l'écart porte sur une lettre tapée en majuscule (le message rappelle alors la touche « Maj »).
// Les deux textes sont alignés par la fin : un article oublié au début ne décale rien.
function slipInfo(typed, expected) {
  const A = letters(clean(typed)), B = letters(norm(expected));
  let kind = '', cap = false;
  for (let i = 1; i <= Math.min(A.length, B.length); i++) {
    const a = A[A.length - i], b = B[B.length - i];
    if (a.b !== b.b) break;
    if (a.c === b.c || (a.lig && !b.lig && b.c === b.b)) continue;          // « sœur » tapé pour un paquet qui écrit « soeur » : l'étudiant n'a pas tort (mais « nœl » n'est pas « noël »)
    const marks = (b.c + a.c).normalize('NFD').replace(/[a-z]/g, '');
    const plain = /^[\u0300-\u0302]*$/.test(marks) && !a.lig && !b.lig;
    if (!plain) return { kind: b.c !== b.b ? b.c : a.c, cap: a.up };
    kind = 'accent'; cap = cap || a.up;
  }
  return { kind, cap };
}
export const slip = (typed, expected) => slipInfo(typed, expected).kind;

// ---------- Articles ----------
// Ce que dit chaque article, langue par langue : genre (m, f, ou '' quand l'article ne le montre pas), nombre, et
// pour le français s'il est élidé (« l' ») ou s'il devrait l'être devant une voyelle (« le », « la », « du », « de la »).
const ART = {
  fr: { re: /^(?:(de la|du|une|un|les|le|la|des)\s+|(de l'|l'))(?=\S)/,
    of: { un: 'ms', une: 'fs', le: 'ms-', la: 'fs-', du: 'ms-', 'de la': 'fs-', "l'": ' s+', "de l'": ' s+', les: ' p', des: ' p' } },
  es: { re: /^(?:(el|la|los|las|unos|unas|una|un)\s+)(?=\S)/,
    of: { el: 'ms', la: 'fs', los: 'mp', las: 'fp', un: 'ms', una: 'fs', unos: 'mp', unas: 'fp' } },
  en: { re: /^(?:(an|a|the|to)\s+)(?=\S)/, of: { a: ' sa', an: ' sn', the: ' s', to: ' st' } },
};
// L'article qui ouvre une forme (déjà en minuscules), ou null. « Le » seul est un mot, pas un article suivi d'un nom.
export function articleOf(form, lang) {
  const T = ART[lang], m = T && T.re.exec(form);
  if (!m) return null;
  const word = m[1] || m[2], f = T.of[word];
  return { word, g: f[0].trim(), n: f[1], x: f[2] || '' };
}
// Seul un nom (ou une fiche dont la catégorie n'est pas connue) a un article qui peut s'échanger contre un autre.
// « Un peu », « la plupart », « a lot », « to run » ne sont pas un nom précédé de son article : leur premier mot
// est exigé tel quel, et un article ajouté devant un verbe ou un adjectif ne convient jamais.
const fixedArt = kind => !!kind && kind !== 'autre' && kind !== 'nom';
// L'article tapé peut-il aller avec ce mot ? e : l'article de la fiche, s'il y en a un ; noun : le mot sans article.
function clash(t, e, noun, lang, gender) {
  if (lang === 'fr') {
    // Élision : elle dépend du début du nom. Devant une voyelle, « l' » et « de l' » sont les seules formes justes
    // (« l'école », jamais « la école ») ; devant une consonne, jamais (« l'café »). La fiche tranche quand son
    // article le montre (« l'hôtel », « le haricot », « la ouate ») ; sinon, devant « h », « y » et quelques mots à
    // part (« le onze », « le oui », « le iota »), les deux formes sont admises : l'appli ne devine pas.
    const n = noAcc(noun), x = e ? e.x : '';
    const start = x === '+' ? 'V' : x === '-' ? 'C' : /^(?:[hy]|onz|oui(?![a-z])|ouistiti|ouate|uhlan|ululement|iota|ola(?![a-z])|one-)/.test(n) ? 'H' : /^[aeiou]/.test(n) ? 'V' : 'C';
    if ((t.x === '+' && start === 'C') || (t.x === '-' && start === 'V')) return true;
  }
  // Espagnol, nom féminin qui commence par un « a » tonique (« el agua », « un aula ») : « el » est obligatoire, « la »
  // est une faute, et « una » reste admis à côté de « un » (Diccionario panhispánico de dudas, articles « el » et « uno »).
  if (lang === 'es' && e && gender === 'f' && (e.word === 'el' || e.word === 'un')) return t.word === 'la';
  const eg = gender === 'mf' ? '' : (e && e.g) || (gender === 'm' || gender === 'f' ? gender : '');
  return !!(eg && t.g && eg !== t.g);
}
// Écart d'article entre la réponse tapée et la forme attendue, toutes deux en minuscules :
//   null      : langue sans règle connue (l'appelant garde alors la simple remarque) ;
//   ''        : rien à dire. L'article tapé convient : le même, ou un autre du même genre et du même nombre
//               (« le café » pour « un café », « le pain » pour « du pain ») ; ou la forme attendue n'a pas
//               d'article (rien n'est exigé) et celui que l'étudiant ajoute peut aller avec le mot ;
//   'missing' : la forme attendue a un article, la réponse n'en a pas ;
//   'wrong'   : l'article tapé ne va pas avec ce mot : autre genre (« une café »), autre nombre (« des café »),
//               élision manquée ou en trop (« la addition », « l'café »), « a » pour « an », « the » pour « to ».
// gender : genre connu de la fiche ('m', 'f', 'mf'), utile quand l'article attendu ne le montre pas (« l'addition »).
function artGap(typed, expected, lang, gender, kind) {
  const T = ART[lang];
  if (!T) return null;
  const e = articleOf(expected, lang), t = articleOf(typed, lang), fixed = fixedArt(kind);
  // Article ajouté à une forme qui n'en a pas : pas une faute pour un nom, sauf s'il ne peut pas aller avec lui (« la école », « une café »).
  if (!e) return !t ? '' : fixed ? 'wrong' : lang !== 'en' && clash(t, null, expected, lang, gender) ? 'wrong' : '';
  if (!t) return 'missing';
  if (t.word === e.word) return '';
  if (fixed || t.n !== e.n) return 'wrong';
  if (lang === 'en') return (t.word === 'the' || e.word === 'the') && t.word !== 'to' && e.word !== 'to' ? '' : 'wrong';      // « the cat » pour « a cat » : rien à dire ; « a apple », « to » : non
  return clash(t, e, expected.replace(T.re, ''), lang, gender) ? 'wrong' : '';
}

// Signes invisibles : espace sans chasse, trait d'union virtuel (fréquent dans un texte copié), marques de sens
// d'écriture, sélecteurs de variante, caractères de commande. Ils sont ignorés dans la comparaison, des deux côtés :
// laissés dans le mot d'une fiche, ils la rendraient impossible à réussir (la réponse visible ne serait jamais égale).
const UNSEEN = /[\p{Cf}͏ᅟᅠ឴឵᠋-᠏ㅤﾠ︀-️\u{E0100}-\u{E01EF}]|(?![\t\n\v\f\r])\p{Cc}/gu;
const seen = s => String(s ?? '').replace(UNSEEN, '');
// Ce qui reste de visible dans un mot : rien, pour une fiche faite seulement de signes invisibles.
export const visible = s => seen(s).trim();

const OPENING = /[¿¡]/g, HAS_OPENING = /[¿¡]/;

// Compare une réponse écrite aux formes acceptées.
//   ok:true                 : la forme exacte (casse et ponctuation finale à part), ou le bon mot avec un autre article
//                             qui lui convient ;
//   ok:true, note 'article' : le bon mot, mais son article manque (art:'missing') ou ne lui convient pas (art:'wrong') ;
//   ok:true, note 'open'    : il ne manque que le signe qui ouvre une question ou une exclamation en espagnol ;
//   ok:true, note 'accent'  : les bonnes lettres, mais un accent ou un signe à revoir (slip dit lequel, cap si la
//                             lettre a été tapée en majuscule, art s'il y a aussi un écart d'article) ;
//   ok:false, near:true     : une lettre d'écart (art s'il y a aussi un écart d'article).
// C'est à l'appelant de décider ce qu'il fait des notes 'accent' et 'article' : voir judge, dans session.js.
// opt.lang : langue du paquet (règles d'article) ; opt.gender : genre connu de la fiche ; opt.kind : sa catégorie
// grammaticale (seul un nom, ou une fiche de catégorie inconnue, a un article qui s'échange contre un autre).
export function check(input, accepted, minNear = 5, { lang = '', gender = '', kind = '' } = {}) {
  const typed = clean(seen(input)).replace(OPENING, '').trim(), a = typed.toLowerCase();
  if (!a) return { ok: false, empty: true };
  const strip = v => norm(seen(v)).replace(OPENING, '').trim(), acc = accepted.map(strip);
  // Le rappel du signe d'ouverture (« ¿ », « ¡ ») ne vaut que si la forme reconnue en porte un dans la fiche.
  const signless = new Set(accepted.filter(v => !HAS_OPENING.test(String(v))).map(strip)), bare1 = !HAS_OPENING.test(String(input));
  const fine = (forms, note) => (note ? { ok: true, note } : bare1 && forms.every(v => !signless.has(v)) ? { ok: true, note: 'open' } : { ok: true });
  if (acc.includes(a)) return fine([a]);
  const a2 = noAcc(a);
  const same = acc.filter(v => noAcc(v) === a2);
  if (same.length) {
    const kinds = same.map(v => slipInfo(typed, v));
    return kinds.some(k => !k.kind) ? fine(same.filter((v, i) => !kinds[i].kind)) : { ok: true, note: 'accent', slip: kinds[0].kind, ...(kinds[0].cap ? { cap: true } : {}) };
  }
  // L'article est retiré avant les accents : « à » n'est pas l'article anglais « a » (« côté » n'est pas « à côté »).
  // Quand la langue du paquet est connue, seul un article de cette langue est retiré : « a veces » n'est pas « veces »
  // en espagnol, ni « à bientôt » « bientôt » en français (« a » n'est un article qu'en anglais).
  const T = ART[lang], unArt = v => (T ? v.replace(T.re, '') : noArt(v)), bareOf = v => noAcc(unArt(v)), a3 = bareOf(a);
  const gap = v => artGap(a, v, lang, gender, kind), art = g => (g ? { art: g } : {});
  const bare = acc.filter(v => bareOf(v) === a3);
  if (bare.length) {
    const found = bare.map(v => ({ v, k: slipInfo(typed, v), g: gap(v) }));
    const clear = found.filter(f => !f.k.kind);
    if (clear.length) {
      const right = clear.filter(f => f.g === '');
      if (right.length) return fine(right.map(f => f.v));                    // un autre article, qui convient au mot
      return { ok: true, note: 'article', art: clear[0].g || 'missing' };    // langue sans règle (g null) : simple remarque, comme avant
    }
    const f = found.find(x => !x.g) || found[0];
    return { ok: true, note: 'accent', slip: f.k.kind, ...(f.k.cap ? { cap: true } : {}), ...art(f.g) };
  }
  // Une lettre d'écart, avec ou sans l'article (« chot » pour « un chat »).
  const close = acc.filter(v => (v.length >= minNear && lev1(noAcc(v), a2)) || (bareOf(v).length >= minNear && lev1(bareOf(v), a3)));
  if (close.length) { const gaps = close.map(gap); return { ok: false, near: true, ...(gaps.some(g => !g) ? {} : art(gaps[0])) }; }
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
