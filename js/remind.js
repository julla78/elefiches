// Éléfiches — rappels. Sans serveur, une page web ne peut pas envoyer de notification quand elle est fermée.
// Le rappel passe donc par l'agenda du téléphone : un rendez-vous qui se répète, avec une alarme, et qui contient
// le lien vers l'application. Format iCalendar (.ics), lu par les agendas d'iOS, d'Android et des ordinateurs.
// Jours du rappel (décision du 28 novembre 2026) : sept jours que l'étudiant coche à la main, du lundi au dimanche. Tant qu'il n'a
// rien choisi, les jours conseillés sont cochés : tous avec un plan (le plan demande un programme chaque jour), un jour sur deux
// sans plan. Répartir les séances vaut mieux que les grouper ; aucune étude ne fonde un jour de la semaine plutôt qu'un autre.
export const WEEK = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const ADVISED = { plan: WEEK, free: ['MO', 'WE', 'FR', 'SU'] };
const OLD = { weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'], three: ['MO', 'WE', 'FR'] };      // anciens choix à trois boutons
// Jours effectifs : la liste choisie (nettoyée, jamais vide), un ancien choix converti, sinon la recommandation.
export function remDays(days, plan = false) {
  const list = Array.isArray(days) ? days : Object.hasOwn(OLD, days) ? OLD[days] : null;
  const clean = list ? WEEK.filter(d => list.includes(d)) : [];
  return clean.length ? clean : [...(plan ? ADVISED.plan : ADVISED.free)];
}
// Cocher ou décocher un jour ; le dernier jour coché ne se décoche pas (un rappel sans jour ne rappelle rien).
export function toggleDay(current, day) {
  if (!WEEK.includes(day)) return [...current];
  const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
  return next.length ? WEEK.filter(d => next.includes(d)) : [...current];
}
const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
// Une ligne iCalendar ne dépasse pas 75 octets : les lignes longues sont repliées.
const fold = line => { const out = []; let cur = ''; for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch; } out.push(cur); return out.join('\r\n'); };

export function buildICS({ time = '18:00', days = WEEK, url = '', title = 'Éléfiches', note = '', now = new Date() } = {}) {
  const [h, m] = (/^\d{1,2}:\d{2}$/.test(time) ? time : '18:00').split(':').map(Number), list = remDays(days, true), by = list.length === 7 ? null : list;      // sept jours : chaque jour
  // Première occurrence : aujourd'hui si l'heure n'est pas passée, sinon le prochain jour prévu.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  for (let i = 0; i < 8 && (start <= now || (by && !by.includes(CODES[start.getDay()]))); i++) start.setDate(start.getDate() + 1);
  const local = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const utc = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const uid = `elefiches-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}@elefiches`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elefiches//Rappel//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${utc(now)}`, `DTSTART:${local(start)}`, 'DURATION:PT10M',
    `RRULE:${by ? 'FREQ=WEEKLY;BYDAY=' + by.join(',') : 'FREQ=DAILY'}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc([note, url].filter(Boolean).join('\n'))}`, ...(url ? [`URL:${url}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
