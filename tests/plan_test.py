# Plan personnel (versions 15b et 15c) : python3 tests/plan_test.py <url de enseignant.html#accueil> <dossier de captures> [csv d'une longue liste]
# Parcours complet : l'enseignant conseille des jours et coche « mots déjà vus en classe » ; l'étudiant choisit son pas,
# fait son programme du jour en deux fois, retrouve tout après rechargement ; le temps avance (mode essai), un jour est
# manqué, le pas change ; un paquet sans jours conseillés garde son fonctionnement habituel.
# Version 15c : test « déjà su » avant le choix du pas, moment de la séance, « J'ai moins de jours », carte sobre (piste de
# pattes qui sert de menu, aucune minute), seconde séance, « Tout revoir », séances courtes proposées, reprise générale.
import sys, json
from playwright.sync_api import sync_playwright
# Depuis le lot 2b, les textes français de l'interface portent des espaces insécables. Les textes lus dans la page sont ramenés à des
# espaces simples avant d'être comparés ; un contrôle à part (essai_test.py) vérifie que les insécables sont bien à l'écran.
from playwright.sync_api import Page as _P, ElementHandle as _E, Locator as _L
def _plain(f): return lambda self, *a, **k: (lambda r: r.replace('\u00a0', ' ') if isinstance(r, str) else r)(f(self, *a, **k))
for _c in (_P, _E, _L):
    for _n in ('inner_text', 'text_content'): setattr(_c, _n, _plain(getattr(_c, _n)))

url, out = sys.argv[1], sys.argv[2]
csv = sys.argv[3] if len(sys.argv) > 3 else ''
student = url.split('enseignant.html')[0] + 'index.html'
errors = []
KV = """async key => { const db = await new Promise((res, rej) => { const r = indexedDB.open('elefiches'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => { db.close(); res(JSON.stringify(q.result ?? null)); }; }); }"""
STEP = """(() => { const s = window.__elefiches.step; if (!s) return null; const a = s.activity || {};
  return { intro: !!s.intro, type: a.type || '', accepted: a.accepted || null, options: a.options || null, answer: a.answer ?? null, left: a.left ? a.left.map(x => x.id) : null, hint: a.hint || '' }; })()"""

def play(page, stop_after=0, seen=None, slow_first=False, wrong=0):
    """Joue la séance en répondant juste. stop_after : nombre de réponses écrites après lequel on quitte la séance.
    wrong : nombre de premières réponses écrites données fausses (elles seront redemandées)."""
    typed = 0
    for _ in range(600):
        if page.locator('.done').count(): return typed
        if page.locator('.intro').count():
            if seen is not None: seen.add('intro')
            page.click('[data-action=next]'); continue
        if page.locator('.feedback').count():
            if page.locator('[data-action=felt]').count(): page.click('[data-action=felt][data-v=easy]')
            else: page.click('.feedback [data-action=next]')
            continue
        a = page.evaluate(STEP)
        if seen is not None: seen.add(a['type'])
        if a['left']:
            for i in a['left']: page.click(f'.tile[data-side=l][data-id="{i}"]'); page.click(f'.tile[data-side=r][data-id="{i}"]')
        elif a['accepted']:
            if stop_after and typed >= stop_after: page.click('[data-action=quit]'); page.wait_for_selector('.deck'); return typed
            if slow_first and typed == 0: page.wait_for_timeout(1300)      # une étape assez longue pour être mesurée
            if wrong > 0: wrong -= 1; page.fill('form.typed input[name=answer]', 'zzzzzz'); page.click('form.typed button.primary'); typed += 1; continue
            page.fill('form.typed input[name=answer]', a['accepted'][0]); page.click('form.typed button.primary'); typed += 1
        elif a['options']:
            if page.locator('[data-action=reveal]').count(): page.click('[data-action=reveal]')
            page.click(f'.option[data-i="{a["options"].index(a["answer"])}"]')
        elif page.locator('[data-action=reveal-self]').count():
            page.click('[data-action=reveal-self]'); page.click('[data-action=self][data-v=good]')
        else: page.click('[data-action=skip]')
    raise AssertionError('séance sans fin')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox']); ctx = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True); page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None); page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url); page.wait_for_selector('.deck')
    did = page.evaluate("window.__elefiches.state.decks[0].id"); n_cards = page.evaluate("window.__elefiches.state.decks[0].cards.length")
    kv = lambda k: json.loads(page.evaluate(KV, k))
    state = lambda expr: page.evaluate('window.__elefiches.state.' + expr)
    txt = lambda sel: page.inner_text(sel).replace('\u00a0', ' ')      # les textes français portent des espaces insécables avant « : »
    narrow = lambda: page.evaluate("document.scrollingElement.scrollWidth <= window.innerWidth + 1")

    # 0. Sans jours conseillés : pas de plan, bouton de séance minuté, et les trois pattes règlent les mots nouveaux par séance,
    #    pour ce paquet seulement (« les pattes partout » : la bande « Appétit du jour » n'existe plus).
    assert not page.locator('.appetite').count() and page.locator('.deck [data-action=start]').count() == 1 and not page.locator('.pathbtn').count()
    assert page.locator('.deck .pacepick[data-action=pace-new]').count() == 3 and page.get_attribute('.deck .pacepick[data-pace=slow]', 'aria-pressed') == 'true' and '3' in txt('.deck .planday')
    page.click('.deck .pacepick[data-pace=fast]'); page.wait_for_timeout(150)
    assert page.get_attribute('.deck .pacepick[data-pace=fast]', 'aria-pressed') == 'true' and '8' in txt('.deck .planday') and narrow()
    assert page.evaluate("document.activeElement?.dataset.pace") == 'fast' and page.locator('.deck [role=status]').count() == 1 and '8' in page.inner_text('.deck [role=status]')      # annonce pour les lecteurs d'écran, sur la carte qui vient de changer
    page.click('.deck .pacepick[data-pace=slow]'); page.wait_for_timeout(150)
    assert page.get_attribute('.deck .pacepick[data-pace=slow]', 'aria-pressed') == 'true'

    # 1. L'enseignant règle le rythme dans l'éditeur du paquet. Une valeur refusée dit quoi écrire et n'est pas enregistrée.
    page.click('[data-action=teacher]'); page.click('.tdeck [data-action=edit]'); page.wait_for_selector('form[data-submit=rename] input[name=days]')
    page.screenshot(path=out + '/plan-0-editeur.png', full_page=True)
    page.evaluate("document.querySelector('form[data-submit=rename]').noValidate = true")
    page.fill('form[data-submit=rename] input[name=days]', '3'); page.click('form[data-submit=rename] button.primary'); page.wait_for_selector('.toast')
    assert 'entre 4 et 60' in txt('.toast') and state('decks[0].days') is None, 'trois jours : refusé avec une explication'
    page.wait_for_selector('.toast', state='detached', timeout=8000)      # le message s'efface seul : les captures suivantes sont nettes
    page.select_option('form[data-submit=rename] select[name=level]', 'A2')      # à partir de A2, la première question est écrite (en A1 : choisir, puis écrire)
    page.fill('form[data-submit=rename] input[name=days]', '6'); page.check('form[data-submit=rename] input[name=seen]'); page.click('form[data-submit=rename] button.primary')
    page.wait_for_selector('.banner.good'); assert state('decks[0].days') == 6 and state('decks[0].seen') is True
    est = txt('form[data-submit=rename] .banner'); assert 'un étudiant qui suit le pas du cours travaillera environ' in est and '6 jours' in est, est      # l'enseignant voit ce que son réglage demande, et quoi faire si c'est trop
    saved = kv('decks')[0]; assert saved['days'] == 6 and saved['seen'] is True, 'enregistré dans le navigateur'
    page.click('[data-action=teacher]'); page.wait_for_selector('.tdeck'); meta = page.inner_text('.tdeck')
    assert 'conseillé en 6 jours' in meta and 'mots vus en classe' in meta, meta
    with page.expect_download() as dl: page.click('.tdeck [data-action=export]')
    exported = json.load(open(dl.value.path(), encoding='utf-8')); assert exported['days'] == 6 and exported['seen'] is True, 'les deux champs partent dans le fichier'

    def finish_day(card='.deck'):
        """Fait tout le programme du jour, en autant de séances qu'il en faut (séances courtes comprises)."""
        for _ in range(12):
            if not page.locator(card + ' [data-action=start]').count(): return
            page.click(card + ' [data-action=start]'); play(page); page.click('.done [data-action=home]'); page.wait_for_selector('.deck')
        raise AssertionError('journée sans fin')

    # 2. Côté étudiant : la carte du paquet invite à commencer ; « Appétit du jour » disparaît (tous les paquets ont un plan).
    page.click('[data-action=home]'); page.wait_for_selector('.deck [data-action=place]')
    assert not page.locator('.appetite').count() and str(n_cards) in txt('.planline') and narrow()

    # 2 bis. Test « déjà su » : trois mots cochés. Un seul est écrit juste du premier coup : lui seul est « déjà su ».
    page.click('.deck [data-action=place]'); page.wait_for_selector('.placelist')
    assert page.locator('.placelist .pick').count() == n_cards and page.locator('.placego .primary').inner_text() == 'Aucun, je choisis mon pas'
    for k in range(3): page.locator('.placelist .pick').nth(k).click()
    assert page.locator('.pick[aria-pressed=true]').count() == 3 and 'Prouver ma sélection · 3' in txt('.placego') and narrow()
    page.locator('.placelist .pick').nth(2).click(); page.locator('.placelist .pick').nth(2).click()      # décocher puis recocher : l'écran ne bouge pas
    page.screenshot(path=out + '/plan-1a-deja-su.png', full_page=True)
    # Lot 2b : le titre garde son espace insécable ; une seule consigne, dans un encart de couleur, sans point (i).
    assert '\u00a0?' in page.evaluate("document.querySelector('h1').textContent")
    assert txt('.banner.say') == 'Touche les mots que tu connais, et ton plan sera calculé en fonction.' and page.locator('.infonote').count() == 0
    page.click('[data-action=place-go]'); page.wait_for_selector('.study')
    q = page.evaluate(STEP); assert q['type'] == 'type' and q['hint'] == '', q
    assert 'Déjà su' in txt('.where') and not page.locator('.hintline, .typed .hint').count()
    page.fill('form.typed input[name=answer]', q['accepted'][0]); page.click('form.typed button.primary'); page.wait_for_selector('.feedback')
    assert 'Déjà su !' in txt('.feedback h3') and 'rejoint ton troupeau' in txt('.feedback') and not page.locator('[data-action=felt]').count(), txt('.feedback')
    page.screenshot(path=out + '/plan-1b-preuve.png', full_page=True); page.click('.feedback [data-action=next]')
    for _ in range(2):
        page.wait_for_selector('form.typed'); page.fill('form.typed input[name=answer]', 'zzzzzz'); page.click('form.typed button.primary'); page.wait_for_selector('.feedback')
        assert 'Pas encore su' in txt('.feedback h3') and 'tu l’apprendras avec les autres' in txt('.feedback'); page.click('.feedback [data-action=next]')
    page.wait_for_selector('.done'); assert 'Mots déjà sus : 1' in txt('.done') and f'Mots à apprendre : {n_cards - 1}' in txt('.done'), txt('.done')
    placed = state(f"progress['{did}']"); known = [k for k, v in placed.items() if not k.startswith('_')]
    assert len(known) == 1 and placed[known[0]]['known'] is True and placed[known[0]]['box'] == 4 and '_plan' not in placed, placed
    assert kv('mesure')['tries'] == 0, 'les mots cochés ne comptent pas dans le taux de réussite'
    page.click('.done [data-action=plan]'); page.wait_for_selector('.paces')

    # 2 ter. Écran du plan : calculé sur les mots restants ; trois pas ; moment de la séance ; « J'ai moins de jours ».
    assert f'Mots à apprendre : {n_cards - 1}' in txt('.planlead')
    names = page.locator('.pace h2').all_inner_texts(); assert names == ['Patte de velours', 'Patte trotteuse', 'Patte pressée'], names
    prints = [page.locator('.pace').nth(i).locator('.trail .paw').count() for i in range(3)]; assert prints == [9, 6, 4], prints
    assert page.locator('.pace').nth(1).locator('.tag.ok').inner_text() == 'Conseillé par ton cours' and page.locator('.pace .primary').count() == 1
    assert all('environ' in x and 'min par jour' in x for x in page.locator('.pace .big').all_inner_texts())
    assert 'Au bout des 6 jours conseillés' in page.locator('.pace').nth(0).inner_text().replace(' ', ' '), 'le pas lent dit ce qui sera prêt au bout des jours conseillés'
    assert 'sans lui, les mots ne seront pas sus' in txt('.banner.say') and not page.is_visible('.planlead.why')
    page.click('details.why summary'); assert 'tu auras vu tous les mots au moins une fois' in txt('.planlead.why'); page.click('details.why summary')
    assert 'Quand feras-tu ta séance ?' in txt('.moment') and not page.locator('.moment [aria-pressed=true]').count()
    page.click('[data-action=moment][data-v="19:00"]'); page.wait_for_selector('.moment [aria-pressed=true]')
    assert kv('settings')['remind'] == {'time': '19:00', 'days': 'daily'} and 'chaque jour vers 19:00' in txt('.moment') and page.locator('.moment [data-action=remind]').count() == 1
    page.click('[data-action=own-open]'); page.wait_for_selector('.ownbox'); assert 'Jours : 3' in txt('.ownn') and '%' in txt('.ownsays') and 'min par jour' in txt('.ownsays')
    page.click('[data-action=own-step][data-v="-1"]'); page.click('[data-action=own-step][data-v="-1"]'); assert 'Jours : 1' in txt('.ownn') and page.locator('[data-action=own-step][data-v="-1"]').is_disabled()
    one_day = txt('.ownsays'); assert 'rappelés un autre jour que celui de leur découverte 0 %' in one_day and 'Un mot vu un seul jour' in txt('.ownbox'), one_day      # annonce honnête : en un jour, aucun rappel espacé
    assert narrow(); page.screenshot(path=out + '/plan-1-pas.png', full_page=True)

    # 3. Un geste : le pas choisi, la première journée commence. Pas d'écran de découverte, première question écrite.
    page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.study')
    first = page.evaluate(STEP); assert first['type'] == 'type' and not first['intro'] and first['hint'], first
    assert not page.locator('.intro').count() and page.locator('form.typed').count() == 1
    page.screenshot(path=out + '/plan-2-question.png', full_page=True)
    plan = state(f"progress['{did}']._plan"); per_day = -(-(n_cards - 1) // 3)      # le mot déjà su n'est plus à découvrir
    assert plan['pace'] == 'mid' and plan['days'] == 6 and plan['day'] == 0 and plan['fresh'] == per_day and plan['est'] >= 1 and plan['recap'] == -1, plan
    kinds = set(); done = play(page, stop_after=2, seen=kinds, slow_first=True); assert done == 2 and 'intro' not in kinds

    # 4. Carte du design (27 novembre) : trois pas visibles avec leur nom, une seule piste, une seule barre (la trompe), les nombres
    # du jour dans le bouton, aucune minute, plus de menu déroulant.
    go = txt('.deck [data-action=start]'); assert 'Continuer' in go and f'{per_day - 2} nouveaux' in go and 'min' not in go and 'révision' not in go, go
    assert page.get_attribute('.deck .trunk', 'aria-valuenow') == str(round(100 * 2 / per_day)) and page.inner_text('.deck .golabel') == 'Continuer' and page.locator('.deck .trunk').count() == 1
    assert 'Jour 1 sur 6' in txt('.planline') and page.locator('.planline .paw').count() == 6 and page.locator('.planline .paw.todo').count() == 5 and page.locator('.planline .paw.now').count() == 1
    card = txt('.deck'); assert 'Changer de pas' not in card and 'Objectif du cours' not in card and 'environ' not in card and ' min' not in card and 'Aujourd’hui' not in card, card
    picks = page.locator('.deck .pacepick'); assert picks.count() == 3 and [picks.nth(i).get_attribute('aria-pressed') for i in range(3)] == ['false', 'true', 'false']
    assert 'Patte' in picks.nth(0).inner_text() and 'velours' in picks.nth(0).inner_text() and 'trotteuse' in picks.nth(1).inner_text() and 'pressée' in picks.nth(2).inner_text()
    assert 'Dans les temps' in txt('.deckfoot .status.ok') and 'le rythme de ton cours' in txt('.planline') and not page.locator('.stagebar').count()
    assert page.locator('.deck .trunk .grass').count() == 1 and page.locator('.top .rulesbtn svg').count() == 1 and page.get_attribute('.top .rulesbtn', 'aria-label') == 'Règles du jeu'
    assert 'short' in page.get_attribute('.top', 'class') and not page.locator('.top .tagline').count(), 'en-tête court dès que le troupeau a commencé'
    assert narrow(); page.screenshot(path=out + '/plan-3-carte.png', full_page=True)

    # 4 bis. Fin de la journée, avec une réponse ratée : elle est proposée en seconde séance, sans déplacer la fiche.
    page.click('.deck [data-action=start]'); play(page, seen=kinds, wrong=1); page.wait_for_selector('.done')
    assert 'Journée faite' in txt('.planwin') and not page.locator('.done [data-action=start]').count(), 'journée faite : le programme est fini'
    assert 'Seconde séance · 1 à redemander' in txt('.done [data-action=second]') and 'facultatif' in txt('.done')
    page.screenshot(path=out + '/plan-4-journee-faite.png', full_page=True)
    page.click('.done [data-action=home]'); page.wait_for_selector('.deck .rest'); assert 'Journée faite' in txt('.deck .rest') and not page.locator('.deck [data-action=start]').count()
    assert page.locator('.deck .daymore [data-action=second]').count() == 1 and not page.locator('.deck [data-action=recap]').count()
    Pw = state(f"progress['{did}']"); weak = [k for k, v in Pw.items() if not k.startswith('_') and v.get('weak')]; assert len(weak) == 1, weak
    before = json.dumps(Pw[weak[0]]['fsrs'], sort_keys=True)
    page.click('.deck [data-action=second]'); page.wait_for_selector('form.typed'); q2 = page.evaluate(STEP); assert q2['type'] == 'type'
    play(page); page.wait_for_selector('.done'); assert not page.locator('.done [data-action=second]').count(); page.click('.done [data-action=home]'); page.wait_for_selector('.deck .rest')
    Pa = state(f"progress['{did}']"); assert 'weak' not in Pa[weak[0]] and json.dumps(Pa[weak[0]]['fsrs'], sort_keys=True) == before, 'redemandé une fois, la fiche n’a pas bougé'
    assert not page.locator('.deck [data-action=second]').count()

    # 5. Tout est conservé : plan, progression et mesure locale survivent au rechargement.
    page.reload(); page.wait_for_selector('.deck .rest')
    P = kv('progress:' + did); born = [k for k, v in P.items() if not k.startswith('_')]
    boxes = sorted(P[k]['box'] for k in born); assert P['_plan']['pace'] == 'mid' and P['_plan']['last'] == 0 and len(born) == per_day + 1 and boxes == [1] + [2] * (per_day - 1) + [4], (P['_plan'], boxes)
    assert P[known[0]]['known'] is True, 'le mot déjà su est conservé'
    M = kv('mesure'); assert M['tries'] == per_day and M['ok'] == per_day - 1 and len(M['t']) >= 1, M

    # 6. Interface étudiant : le plan y est, l'espace enseignant n'y est pas.
    page.goto(student); page.wait_for_selector('.deck .rest'); assert page.locator('.planline').count() == 1 and not page.locator('[data-action=teacher]').count()
    page.click('[data-action=rules]'); rules = page.inner_text('#app'); assert 'Trois pattes, trois rythmes' in rules.replace('\u00a0', ' ') and 'Le dernier jour, tu revois tout' in rules and 'peut revenir le jour même' in rules and page.locator('.rulelist li').count() == 8; page.click('[data-action=home]')
    page.click('[data-action=privacy]'); assert 'Ta vitesse et tes réussites' in page.inner_text('#app')

    # 7. Le temps avance (mode essai de l'enseignant). Jour 2 : « Tout revoir » à la demande et séances courtes proposées.
    page.goto(url); page.wait_for_selector('.deck'); page.click('[data-action=teacher]'); page.click('[data-action=sb-on]'); page.wait_for_selector('section.sandbox')
    page.click('.deck [data-action=place]'); page.wait_for_selector('.placelist'); page.click('[data-action=place-skip]'); page.wait_for_selector('.paces')
    assert f'Mots à apprendre : {n_cards}' in txt('.planlead'), 'progression d’essai : aucun mot déjà su'
    page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.study'); play(page)
    page.click('.done [data-action=home]'); page.wait_for_selector('.deck .rest'); pd0 = -(-n_cards // 3)
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.gosub')
    assert 'Jour 2 sur 6' in txt('.planline') and f'{-(-(n_cards - pd0) // 2)} nouveaux' in txt('.gosub'), txt('.deck')
    assert kv('progress:' + did)['_plan']['last'] == 0 and len([k for k in kv('essai:' + did) if not k.startswith('_')]) == pd0, 'la vraie progression ne bouge pas'
    finish_day(); page.wait_for_selector('.deck .rest')
    # Séances courtes : proposées une fois, quand moins de trois premières réponses sur quatre sont justes après deux jours travaillés.
    assert not page.locator('.planoffer').count()
    page.evaluate("window.__elefiches.state.measure = { t: Array(12).fill(18), tries: 40, ok: 20 }; window.__elefiches.rerender()"); page.wait_for_selector('.planoffer')
    offer = txt('.planoffer'); assert 'séances plus courtes' in offer and '5 mots nouveaux' in offer and 'profil' not in offer.lower(), offer
    page.screenshot(path=out + '/plan-5a-parcours.png', full_page=True)
    page.click('.planoffer [data-action=offer][data-v=yes]'); page.wait_for_selector('.planoffer', state='detached')
    sb = state(f"progress['{did}']._plan"); assert sb['small'] is True and sb['offer'] == 2, sb
    # « Tout revoir aujourd'hui » : une fois par jour, les mots jamais rappelés un autre jour que celui de leur découverte.
    rec = page.locator('.deck [data-action=recap]'); assert rec.count() == 1 and 'Tout revoir aujourd’hui' in rec.inner_text(), txt('.deck')
    rec.click(); page.wait_for_selector('.study'); sess = state('session.queue.length') + 1; assert state('session.today.length') == 0 and sess <= 10, 'séance courte : dix révisions au plus'
    play(page); page.click('.done [data-action=home]'); page.wait_for_selector('.deck'); finish_day(); page.wait_for_selector('.deck .rest')
    sb = state(f"progress['{did}']._plan"); assert sb['ask'] == 1 and not page.locator('.deck [data-action=recap]').count(), 'une fois par jour'
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.planline:has-text("jour 3 sur 6")'); assert not page.locator('.planmiss').count()
    page.click('.deck [data-action=start]'); page.wait_for_selector('.study'); assert state('session.today.length') <= 5, 'séance courte : cinq mots nouveaux au plus'
    page.click('[data-action=quit]'); page.wait_for_selector('.deck')
    page.wait_for_selector('.deck [data-action=small][data-v=off]'); page.click('.deck [data-action=small]'); page.wait_for_selector('.deck [data-action=small][data-v=on]')
    assert state(f"progress['{did}']._plan.small") is False and state(f"progress['{did}']._plan.offer") == 2, 'retour aux séances habituelles, sans nouvelle proposition'
    # Jour 4 après un jour manqué (le jour 3 n'a pas été fait).
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.planmiss')
    miss = txt('.planmiss'); assert 'Jours sans séance : 1' in miss, miss
    assert 'Jour 4 sur 6' in txt('.planline') and 'En retard' in txt('.deckfoot .status.late'); page.screenshot(path=out + '/plan-5-jour-manque.png', full_page=True)
    finish_day(); page.wait_for_selector('.deck .rest')
    sb = state(f"progress['{did}']._plan"); assert sb['missed'] == 1 and sb['ack'] == 1 and sb['last'] == 3, sb
    assert not page.locator('.planmiss').count(), 'jour manqué annoncé une fois, pas davantage'
    # Dernier jour du plan : la reprise générale est au programme, et la carte le dit.
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.planline:has-text("jour 5 sur 6")'); finish_day(); page.wait_for_selector('.deck .rest')
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.planline:has-text("jour 6 sur 6")')
    last = txt('.gosub'); assert 'reprise générale' in last, last
    assert state(f"progress['{did}']._plan.recap") == 5; page.screenshot(path=out + '/plan-6-reprise.png', full_page=True)
    # Changement de pas depuis la carte (un toucher, sans annonce de minutes ; le focus reste sur le pas choisi) : la durée s'allonge, la reprise générale repart à la nouvelle fin du plan.
    before = state(f"progress['{did}']._plan"); page.click('.pacepick[data-pace=fast]'); page.wait_for_selector('.paceundo[data-action=pace-undo]')
    assert txt('.paceundo') == 'Annuler' and 'Patte pressée' in page.inner_text('.planline [role=status]') and state(f"progress['{did}']._plan.pace") == 'fast'
    assert narrow(); page.screenshot(path=out + '/plan-6a-annuler.png', full_page=True)
    page.click('[data-action=pace-undo]'); page.wait_for_selector('.paceundo', state='detached'); assert state(f"progress['{did}']._plan") == before, 'Annuler rend le plan tel qu’il était'
    page.click('.pacepick[data-pace=slow]'); page.wait_for_selector('.pacepick[data-pace=slow][aria-pressed=true]'); assert page.locator('[data-action=pace-undo]').count() == 1
    assert not page.locator('.banner.good').count() and page.evaluate("document.activeElement.dataset.pace") == 'slow' and 'des séances plus légères' in txt('.planline')
    sb = state(f"progress['{did}']._plan"); assert sb['pace'] == 'slow' and sb['days'] == 9 and sb['start'] and sb['recap'] == -1 and 'Jour 6 sur 9' in txt('.planline'), sb
    assert 'reprise générale' not in txt('.gosub') if page.locator('.gosub').count() else True
    # « J'ai moins de jours » : toucher la piste ouvre « Ton plan », où se trouve le lien ; le plan prend les jours dits.
    page.click('.deck .pathbtn'); page.wait_for_selector('[data-action=own-open]'); page.click('[data-action=own-open]'); page.wait_for_selector('.ownbox')
    assert 'Jours : 3' in txt('.ownn') and 'à partir d’aujourd’hui' in txt('.ownsays') and page.locator('.pace.current').count() == 1 and not page.locator('.moment').count()
    page.screenshot(path=out + '/plan-6b-moins-de-jours.png', full_page=True)
    page.click('.ownbox [data-action=pace]'); page.wait_for_selector('.banner.good')
    sb = state(f"progress['{did}']._plan"); assert sb['pace'] == 'own' and sb['days'] == 8 and 'Jour 6 sur 8' in txt('.planline') and 'tes jours' in txt('.planline') and not page.locator('.pacepick[aria-pressed=true]').count(), sb
    assert page.locator('.deck .pacepick').count() == 3, 'les trois pas restent proposés quand l’étudiant a choisi ses jours'
    page.click('[data-action=sb-off]'); page.wait_for_selector('.sbcard')

    # 8. Un second paquet, sans jours conseillés : il a ses trois pattes (mots nouveaux par séance) et sa séance minutée, à côté du paquet à plan.
    page.click('summary:has-text("Faire le paquet à la main")'); page.click('[data-action=try][data-model=fr]'); page.wait_for_selector('.deck')
    assert not page.locator('.appetite').count() and page.locator('.deck').count() == 2 and page.locator('.pacepick[data-action=pace-new]').count() == 3 and page.locator('.pacepick[data-action=pace]').count() == 3
    cards = page.locator('.deck'); plain = [i for i in range(2) if not cards.nth(i).locator('.pathbtn').count()]
    assert len(plain) == 1 and 'min' in cards.nth(plain[0]).locator('[data-action=start]').inner_text() and not cards.nth(plain[0]).locator('.status').count()
    assert 'Défi dans' in cards.nth(plain[0]).locator('.chlock').inner_text(), 'ligne du défi raccourcie pour tous les paquets'
    cards.nth(plain[0]).locator('[data-action=start]').click(); page.wait_for_selector('.intro'); page.click('[data-action=quit]')
    page.set_viewport_size({'width': 1100, 'height': 800}); page.wait_for_selector('.deck'); page.screenshot(path=out + '/plan-7-large.png', full_page=True)

    # 8 bis. Un fichier qui règle lui-même le rythme (écrit par une IA ou par un tiers) : l'import le dit à l'enseignant.
    page.set_viewport_size({'width': 390, 'height': 844}); page.click('[data-action=teacher]'); page.wait_for_selector('form[data-submit=import]')
    page.evaluate("document.querySelectorAll('form[data-submit=import] details').forEach(d => { d.open = true; })")
    page.fill('form[data-submit=import] textarea[name=text]', json.dumps({**exported, 'days': 5})); page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.banner.good')
    warn = txt('.banner.good'); assert 'règle lui-même le rythme' in warn and 'jours conseillés 5' in warn and 'classe : oui' in warn, warn
    assert [d for d in state('decks.map(d => ({ id: d.id, days: d.days }))') if d['id'] == did][0]['days'] == 5

    # 9. Longue liste (si un CSV est fourni) : jours conseillés saisis à l'import. Un jour manqué se rattrape pour cinq
    # minutes de plus par jour au plus : simple annonce. Au-delà, l'étudiant choisit entre garder la fin et garder ses minutes.
    if csv:
        page.click('[data-action=teacher]'); page.wait_for_selector('form[data-submit=import]')
        page.click('summary:has-text("Pour un fichier CSV")'); page.fill('form[data-submit=import] input[name=name]', 'Longue liste (A2)'); page.select_option('form[data-submit=import] select[name=level]', 'A2')
        page.click('form[data-submit=import] summary:has-text("Rythme")'); page.fill('form[data-submit=import] input[name=days]', '6'); page.set_input_files('input[name=files]', csv)
        page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.banner.good')
        long = [d for d in state('decks.map(d => ({ id: d.id, name: d.name, days: d.days || 0, seen: d.seen === true, n: d.cards.length }))') if d['name'] == 'Longue liste (A2)'][0]
        assert long['days'] == 6 and not long['seen'] and long['n'] > 60, long
        page.click('[data-action=teacher]'); page.click('[data-action=sb-on]'); page.wait_for_selector('section.sandbox')
        page.click(f'.deck [data-action=place][data-id="{long["id"]}"]'); page.wait_for_selector('.placelist'); assert page.locator('.pick').count() == long['n'] and narrow()
        page.screenshot(path=out + '/plan-8a-deja-su-longue.png', full_page=True); page.click('[data-action=place-skip]'); page.wait_for_selector('.paces'); page.screenshot(path=out + '/plan-8-longue-liste.png', full_page=True)
        assert 'jusqu’à' in txt('.paces'), 'les jours de découverte sont plus chargés : l’écran le dit'
        page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.intro'); page.click('[data-action=quit]'); page.wait_for_selector('.deck')      # mots non vus en classe : l'écran de découverte reste
        mine = f'.deck:has(.pathbtn[data-id="{long["id"]}"])'
        day = lambda n: page.wait_for_selector(mine + f' .planline:has-text("jour {n} sur 6")')      # un saut à la fois : le suivant n'est accepté qu'une fois le premier fini
        # Depuis la 15c, la reprise générale du dernier jour est comptée dans les minutes : pour cette longue liste, le
        # choix est proposé dès le deuxième jour manqué (un seul jour manqué reste une simple annonce).
        page.click('[data-action=sb-skip][data-days="1"]'); day(2)
        assert 'Jours sans séance : 1' in txt(mine + ' .planmiss') and not page.locator(mine + ' [data-action=plan-keep]').count(), txt(mine + ' .planmiss')
        page.click('[data-action=sb-skip][data-days="1"]'); day(3); page.wait_for_selector(mine + ' .planmiss [data-action=plan-keep]')
        ask = txt(mine + ' .planmiss'); assert 'Jours sans séance : 2' in ask and 'Finir comme prévu' in ask and 'plus tard' in ask, ask
        page.screenshot(path=out + '/plan-9-choix.png', full_page=True)
        page.click(mine + ' .planmiss [data-action=plan-keep][data-v=min]'); page.wait_for_selector(mine + ' .planmiss', state='detached')
        lp = state(f"progress['{long['id']}']._plan"); assert lp['days'] == 8 and lp['ack'] == 2 and 'Jour 3 sur 8' in txt(mine + ' .planline'), lp
        page.click('[data-action=sb-off]'); page.wait_for_selector('.sbcard')

    print('ERREURS CONSOLE:', errors or 'aucune'); assert not errors, errors
    b.close()
print('test du plan personnel réussi')
