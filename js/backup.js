// Éléfiches — sauvegarde de la progression dans un fichier, et restauration.
// La progression vit dans le navigateur. Un fichier de sauvegarde la protège d'un changement d'appareil, d'un nettoyage
// des données de navigation, et de Safari, qui efface les données d'un site resté sept jours sans visite s'il n'est pas
// installé sur l'écran d'accueil.
const KEY = /^[A-Za-z0-9_-]{1,64}$/, BAD = ['__proto__', 'constructor', 'prototype'];
const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const stamp = st => +(st?.fsrs?.last_review || 0) || (st?.seen ? 1 : 0);

// Un état de fiche venu d'un fichier ou du stockage n'est jamais repris tel quel : chaque champ est reconstruit avec
// son type et ses bornes. Du texte ou du HTML glissé dans une sauvegarde forgée ne peut donc pas atteindre l'écran,
// et une date dans le futur ne peut pas écraser un travail réel.
export function cleanState(st, now = Date.now()) {
  if (!st || typeof st !== 'object') return null;
  const out = { seen: !!st.seen, box: Math.round(num(st.box, 1, 5, 1)), lastOk: !!st.lastOk };
  if (Number.isFinite(+st.born)) out.born = Math.min(+st.born, now);
  if (st.fsrs && typeof st.fsrs === 'object') {
    out.fsrs = {};
    for (const [k, v] of Object.entries(st.fsrs)) if (KEY.test(k) && !BAD.includes(k) && Number.isFinite(+v) && typeof v !== 'boolean' && v !== null && v !== '') out.fsrs[k] = +v;
    out.fsrs.last_review = Math.min(num(out.fsrs.last_review, 0, now, now), now);
    out.fsrs.due = num(out.fsrs.due, 0, now + 5 * 365 * 86400000, now);      // jamais « à revoir en 2100 »
    // Un état de mémoire incomplet ou invraisemblable bloquerait la fiche : elle redevient une fiche tout juste découverte.
    const f = out.fsrs, ok = [0, 1, 2, 3].includes(f.state) && f.stability > 0 && f.stability < 40000 && f.difficulty >= 1 && f.difficulty <= 10;
    if (!ok) { delete out.fsrs; out.box = 1; }
  } else out.box = 1;                       // découverte, pas encore révisée : c'est l'état d'une fiche après sa présentation
  return out;
}
export function cleanProgress(P, now = Date.now()) {
  const out = {};
  if (!P || typeof P !== 'object') return out;
  for (const [id, st] of Object.entries(P)) {
    if (BAD.includes(id) || !st || typeof st !== 'object') continue;
    if (id === '_stages') out._stages = Object.fromEntries(Object.entries(st).filter(([k, v]) => /^\d{1,3}$/.test(k) && Number.isFinite(+v)).map(([k, v]) => [k, Math.min(+v, now)]));
    else if (id === '_race' || id === '_match') out[id] = { best: Math.round(num(st.best, 0, 999, 0)), runs: Math.round(num(st.runs, 0, 1e6, 0)) };
    else if (!id.startsWith('_') && KEY.test(id)) { const c = cleanState(st, now); if (c) out[id] = c; }
  }
  return out;
}

export function makeBackup({ decks, progress, settings, now = Date.now() }) {
  return JSON.stringify({ elefiches: 'sauvegarde', version: 1, date: new Date(now).toISOString(), settings, decks, progress });
}

// Lit un fichier de sauvegarde. Renvoie null si ce n'en est pas un.
export function readBackup(text) {
  let b; try { b = JSON.parse(text); } catch { return null; }
  if (!b || b.elefiches !== 'sauvegarde' || !b.progress || typeof b.progress !== 'object' || !Array.isArray(b.decks) || b.decks.length > 200) return null;
  return b;
}

// Fusionne une sauvegarde avec la progression présente : pour chaque fiche, l'état le plus récent l'emporte.
// Restaurer une vieille sauvegarde ne détruit donc jamais un travail plus récent.
export function mergeProgress(current = {}, saved = {}, now = Date.now()) {
  const out = cleanProgress(current, now), add = cleanProgress(saved, now);
  for (const [id, st] of Object.entries(add)) {
    if (id === '_stages') out._stages = { ...st, ...(out._stages || {}) };
    else if (id.startsWith('_')) { if (!out[id] || st.best > out[id].best) out[id] = st; }
    else if (!out[id] || stamp(st) > stamp(out[id])) out[id] = st;
  }
  return out;
}
// Combien de fiches de la progression présente seraient remplacées par la sauvegarde.
export function countReplaced(current = {}, saved = {}, now = Date.now()) {
  const cur = cleanProgress(current, now), add = cleanProgress(saved, now);
  return Object.keys(add).filter(id => !id.startsWith('_') && cur[id] && stamp(add[id]) > stamp(cur[id])).length;
}
// Combien de fiches la sauvegarde ajouterait à la progression présente.
export function countAdded(current = {}, saved = {}, now = Date.now()) {
  const cur = cleanProgress(current, now), add = cleanProgress(saved, now);
  return Object.keys(add).filter(id => !id.startsWith('_') && !cur[id]).length;
}
