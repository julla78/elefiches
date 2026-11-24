// Éléfiches — code d'accès à l'espace enseignant.
//
// Les étudiants reçoivent le lien de l'espace étudiant (index.html) ; l'espace enseignant (enseignant.html) demande un
// code, donné sur demande par la personne responsable du site. Le code lui-même n'est écrit nulle part : seule son
// empreinte figure ci-dessous (PBKDF2, SHA-256, sel aléatoire).
//
// Ce que ce verrou fait : il cache l'espace enseignant à qui ouvre simplement le lien.
// Ce qu'il ne fait pas : le site est public et sans serveur. La porte se contourne sans le code, en quelques lignes ou en
// servant une copie du dépôt. L'empreinte ci-dessous est publique : un code faible, ou réutilisé ailleurs, peut être
// deviné hors ligne. Le code doit donc être inventé pour cet usage, jamais un mot de passe employé ailleurs. Il n'y a rien de confidentiel derrière (aucune donnée d'étudiant, aucun compte) : c'est une porte fermée,
// pas un coffre-fort. Pour un contrôle d'accès véritable, il faut un hébergement avec authentification.
//
// Pour définir ou changer le code : espace enseignant → « Code d'accès » → créer la ligne, puis la coller ci-dessous
// entre les apostrophes. Changer la ligne retire l'accès à tous les appareils qui avaient l'ancien code.
export const ACCESS = 'pbkdf2$600000$aa5dc4e8e04f063bacd4316d8061904c$cd7f93ed51fa5af792181c6f6dce103e1b7300ed46c829d6af3fa6b77e8827b8';

const FORMAT = /^pbkdf2\$(\d{4,7})\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
export const MIN_CODE = 12, ITERATIONS = 600000, MIN_ITER = 1000, MAX_ITER = 2000000;
// Une ligne n'active la porte que si elle peut aussi l'ouvrir : mêmes bornes ici et dans checkAccess.
export const validAccess = line => { const m = FORMAT.exec(String(line || '')); return !!m && +m[1] >= MIN_ITER && +m[1] <= MAX_ITER; };
// Codes refusés d'office : uniquement des chiffres, ou presque toujours le même caractère.
const weak = code => /^[\d\s]+$/.test(code) || new Set(code.replace(/\s/g, '')).size < 5;
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
// Le code est comparé sans tenir compte des espaces de début et de fin ni de la forme des caractères accentués.
const clean = code => String(code ?? '').normalize('NFKC').trim();

async function derive(code, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(clean(code)), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
// Fabrique la ligne à ranger dans ACCESS pour un code donné.
export async function makeAccess(code, iterations = ITERATIONS) {
  if (clean(code).length < MIN_CODE) throw new Error('short');
  if (weak(clean(code))) throw new Error('weak');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${hex(salt)}$${await derive(code, salt, iterations)}`;
}
// Vrai si le code saisi correspond à la ligne enregistrée. Une ligne absente ou mal formée ne laisse entrer personne.
export async function checkAccess(code, line = ACCESS) {
  const m = FORMAT.exec(String(line || ''));
  if (!validAccess(line) || !clean(code)) return false;
  const got = await derive(code, unhex(m[2]), +m[1]);
  let diff = 0; for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ m[3].charCodeAt(i);
  return diff === 0;
}
