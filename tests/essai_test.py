# Mode essai (« Tester sans limites ») : python3 tests/essai_test.py <url de enseignant.html#accueil> <dossier de captures>
# Vérifie que les essais sont rangés à part, que la vraie progression n'est jamais touchée, que le temps avance,
# que la remise à zéro n'efface que les essais et que l'interface étudiant n'a pas ce mode.
import sys, json
from playwright.sync_api import sync_playwright
import _outils      # démonstration sans jours conseillés pour ce parcours, attente de trois secondes levée (voir tests/_outils.py)
# Depuis le lot 2b, les textes français de l'interface portent des espaces insécables. Les textes lus dans la page sont ramenés à des
# espaces simples avant d'être comparés ; un contrôle à part (essai_test.py) vérifie que les insécables sont bien à l'écran.
from playwright.sync_api import Page as _P, ElementHandle as _E, Locator as _L
def _plain(f): return lambda self, *a, **k: (lambda r: r.replace('\u00a0', ' ') if isinstance(r, str) else r)(f(self, *a, **k))
for _c in (_P, _E, _L):
    for _n in ('inner_text', 'text_content'): setattr(_c, _n, _plain(getattr(_c, _n)))

url, out = sys.argv[1], sys.argv[2]
student = url.split('enseignant.html')[0] + 'index.html'
errors = []
KV = """async key => { const db = await new Promise((res, rej) => { const r = indexedDB.open('elefiches'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => { db.close(); res(JSON.stringify(q.result ?? null)); }; }); }"""

def intros(page, n=3):
    """Découvre n mots puis revient à l'accueil : cela suffit à créer une progression."""
    page.click('.deck [data-action=start]')
    for _ in range(n):
        page.wait_for_selector('.intro'); page.click('[data-action=next]')
    page.click('[data-action=quit]'); page.wait_for_selector('.deck')

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}); page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None); page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url); page.wait_for_selector('.deck')
    did = page.evaluate("window.__elefiches.state.decks[0].id")
    kv = lambda k: json.loads(page.evaluate(KV, k))
    seen = lambda P: sorted(k for k in (P or {}) if not k.startswith('_'))

    # 1. Une vraie progression existe avant d'entrer dans le mode essai.
    intros(page); real = kv('progress:' + did); assert len(seen(real)) == 3, real
    assert not page.locator('.sandbox').count() and kv('essai') is None

    # 2. Entrée par l'espace enseignant : bandeau, progression d'essai vide, vraie progression intacte.
    page.click('[data-action=teacher]'); page.wait_for_selector('.sbcard'); page.screenshot(path=out + '/essai-1-enseignant.png')
    # Typographie française (lot 2b) : à l'écran, aucune espace ordinaire devant « : ; ! ? » ni dans les guillemets.
    import re as _re; raw = page.evaluate("document.querySelector('#app').innerText")
    assert '\u00a0:' in raw and not _re.search(r'[ \u202f][:;!?»]|«[ \u202f]', raw), 'espace ordinaire : ' + repr(_re.findall(r'.{0,14}[ \u202f][:;!?»]', raw)[:3])
    # Point (i) de « Tester sans limites » : fermé au départ, il s'ouvre et se referme au toucher.
    assert page.locator('.sbcard .infonote').count() == 1 and not page.is_visible('.sbcard .infobox')
    page.click('.sbcard .infonote summary'); assert page.is_visible('.sbcard .infobox'); page.screenshot(path=out + '/essai-1b-info.png'); page.click('.sbcard .infonote summary'); assert not page.is_visible('.sbcard .infobox')
    page.click('[data-action=sb-on]'); page.wait_for_selector('section.sandbox'); page.screenshot(path=out + '/essai-2-accueil.png', full_page=True)
    assert page.evaluate("window.__elefiches.state.sandbox") is True and kv('essai')['on'] is True
    assert seen(page.evaluate("window.__elefiches.state.progress")[did]) == [], 'le mode essai commence sans progression'
    assert not page.locator('[data-action=backup]').count() and not page.locator('[data-file=backup]').count(), 'pas de sauvegarde en mode essai'

    # 3. Deux sessions d'affilée sans frein ; tout va sous la clé d'essai.
    intros(page)
    page.click('.deck [data-action=start]'); page.wait_for_selector('.study')
    ses = page.evaluate("({ n: window.__elefiches.state.session.today.length, left: window.__elefiches.state.session.endAt - Date.now() })")
    assert ses['n'] == 3 and ses['left'] > 9 * 3600000, ('nouveaux mots servis sans frein, pas de fin à l’heure', ses)
    page.click('[data-action=quit]'); page.wait_for_selector('.deck')
    trial = kv('essai:' + did); assert len(seen(trial)) == 3, trial
    assert kv('progress:' + did) == real, 'la vraie progression ne bouge pas pendant les essais'
    page.click('.deck [data-action=start]'); page.wait_for_selector('p.sandbox.mini'); page.screenshot(path=out + '/essai-3-session.png')
    page.click('[data-action=quit]'); page.wait_for_selector('.deck'); trial = kv('essai:' + did)

    # 4. Avancer d'un jour : toutes les dates d'essai reculent d'un jour, le défi d'étape peut s'ouvrir, la vraie progression ne bouge pas.
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.banner.good')
    after = kv('essai:' + did); k = seen(trial)[0]
    assert trial[k]['born'] - after[k]['born'] == 86400000, (trial[k], after[k])
    assert kv('essai')['days'] == 1 and kv('progress:' + did) == real
    page.click('[data-action=sb-skip][data-days="0"]'); page.wait_for_timeout(400)
    page.click('[data-action=sb-skip][data-days="7"]'); page.wait_for_timeout(400); assert kv('essai')['days'] >= 9, kv('essai')
    page.screenshot(path=out + '/essai-4-temps.png', full_page=True)
    assert page.locator('.deck [data-action=start]').count(), 'après un saut dans le temps, des révisions attendent'

    # 5. Le mode essai survit à un rechargement ; l'interface étudiant l'ignore et montre la vraie progression.
    page.reload(); page.wait_for_selector('section.sandbox'); assert page.evaluate("window.__elefiches.state.sandbox") is True
    st = ctx.new_page(); st.on('pageerror', lambda e: errors.append(str(e))); st.goto(student); st.wait_for_selector('.deck')
    assert st.evaluate("window.__elefiches.state.sandbox") is False and not st.locator('.sandbox').count()
    assert seen(st.evaluate("window.__elefiches.state.progress")[did]) == seen(real)
    # un bouton forgé dans la page étudiant ne fait rien
    st.evaluate("for (const a of ['sb-on', 'sb-skip', 'sb-reset-yes']) { const x = document.createElement('button'); x.dataset.action = a; x.dataset.days = '7'; document.getElementById('app').append(x); x.click(); }")
    st.wait_for_timeout(300); assert st.evaluate("window.__elefiches.state.sandbox") is False
    assert kv('progress:' + did) == real and kv('essai')['on'] is True; st.close()

    # 5 bis. Depuis l'espace enseignant, « Reprendre mes essais » ramène à l'accueil d'essai.
    page.click('[data-action=teacher]'); page.wait_for_selector('.sbcard'); page.click('.sbcard [data-action=sb-on]'); page.wait_for_selector('section.sandbox')
    # 6. Remise à zéro en deux temps : seuls les essais sont effacés.
    page.click('[data-action=sb-reset]'); assert kv('essai:' + did) == kv('essai:' + did) and len(seen(kv('essai:' + did))) >= 3
    page.click('[data-action=sb-reset-yes]'); page.wait_for_timeout(200); assert len(seen(kv('essai:' + did))) >= 3, 'un double-clic ne suffit pas'
    page.wait_for_timeout(900); page.click('[data-action=sb-reset-yes]'); page.wait_for_selector('.banner.good')
    assert seen(kv('essai:' + did)) == [] and kv('essai')['days'] == 0 and kv('progress:' + did) == real

    # 7. Sortie : retour à l'espace enseignant, vraie progression retrouvée telle quelle.
    intros(page, 1); page.click('.deck [data-action=start]'); page.wait_for_selector('p.sandbox.mini'); page.click('p.sandbox.mini [data-action=sb-off]')
    page.wait_for_selector('.sbcard'); assert page.evaluate("window.__elefiches.state.sandbox") is False and kv('essai')['on'] is False
    assert seen(page.evaluate("window.__elefiches.state.progress")[did]) == seen(real) and kv('progress:' + did) == real
    page.click('[data-action=home]'); page.wait_for_selector('.deck'); assert not page.locator('.sandbox').count()
    assert page.locator('[data-action=backup]').count(), 'la sauvegarde revient hors du mode essai'
    assert len(seen(kv('essai:' + did))) >= 1, 'les essais restent rangés pour une prochaine fois'

    # 8. Gestes rapprochés, avec deux paquets : pendant un basculement, un saut ou une remise à zéro, rien d'autre ne
    #    passe, et la vraie progression des deux paquets reste exactement la même.
    import json as _j
    extra = _j.dumps({"elefiches": 1, "name": "Second (B1)", "lang": "fr", "level": "B1", "cards": [
        {"word": "Un mot" + str(i), "pos": "nom", "gender": "m", "definition": "Définition numéro %d." % i, "examples": ["Voici un [mot%d] ici." % i]} for i in range(6)]})
    page.set_input_files('input[data-file=packet]', {'name': 'second.json', 'mimeType': 'application/json', 'buffer': extra.encode()})
    page.wait_for_timeout(1200); page.goto(url); page.reload(); page.wait_for_selector('.deck')
    ids = page.evaluate("window.__elefiches.state.decks.map(d => d.id)"); assert len(ids) == 2
    page.locator('.deck [data-action=start]').nth(1).click()
    for _ in range(3): page.wait_for_selector('.intro'); page.click('[data-action=next]')
    page.click('[data-action=quit]'); page.wait_for_selector('.deck')
    reals = {i: kv('progress:' + i) for i in ids}; assert all(len(seen(reals[i])) >= 3 for i in ids), reals
    same = lambda: all(kv('progress:' + i) == reals[i] for i in ids)
    fire = lambda *acts: page.evaluate("""acts => { for (const [a, d] of acts) { const x = document.createElement('button'); x.dataset.action = a; if (d !== null) x.dataset.days = d; if (a === 'start') x.dataset.id = window.__elefiches.state.decks[0].id; document.getElementById('app').append(x); x.click(); x.remove(); } }""", [list(a) for a in acts])
    page.click('[data-action=teacher]'); page.click('[data-action=sb-on]'); page.wait_for_selector('section.sandbox')
    page.locator('.deck [data-action=start]').nth(1).click(); page.wait_for_selector('.intro'); page.click('[data-action=next]'); page.click('[data-action=quit]'); page.wait_for_selector('.deck')
    assert all(len(seen(kv('essai:' + i))) >= 1 for i in ids), 'des essais existent dans les deux paquets'
    fire(('sb-skip', '1'), ('sb-off', None), ('sb-skip', '7')); page.wait_for_timeout(600)
    assert same(), 'saut puis sortie immédiate : la vraie progression ne bouge pas'
    assert page.evaluate("window.__elefiches.state.sandbox") is True and kv('essai')['days'] == 1, 'un seul geste a été pris'
    page.click('[data-action=sb-reset]'); page.wait_for_timeout(900)
    fire(('sb-reset-yes', None), ('sb-off', None)); page.wait_for_timeout(600)
    assert same(), 'remise à zéro puis sortie immédiate : la vraie progression ne bouge pas'
    assert all(seen(kv('essai:' + i)) == [] for i in ids)
    if not page.evaluate("window.__elefiches.state.sandbox"): page.click('[data-action=sb-on]'); page.wait_for_selector('section.sandbox')
    page.locator('.deck [data-action=start]').first.click(); page.wait_for_selector('.intro'); page.click('[data-action=next]'); page.click('[data-action=quit]'); page.wait_for_selector('.deck')
    fire(('sb-off', None), ('start', None)); page.wait_for_timeout(600)
    assert same(), 'sortie puis « Commencer » immédiat : aucun essai n’est écrit dans la vraie progression'
    assert page.evaluate("window.__elefiches.state.sandbox") is False and page.evaluate("window.__elefiches.state.session") is None
    page.evaluate("window.__elefiches.rerender()"); assert all(seen(page.evaluate("window.__elefiches.state.progress")[i]) == seen(reals[i]) for i in ids)
    b.close()
print('ERREURS CONSOLE:', errors or 'aucune'); assert not errors
print('test du mode essai réussi')
