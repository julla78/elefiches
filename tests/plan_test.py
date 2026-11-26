# Plan personnel (version 15b) : python3 tests/plan_test.py <url de enseignant.html#accueil> <dossier de captures> [csv d'une longue liste]
# Parcours complet : l'enseignant conseille des jours et coche « mots déjà vus en classe » ; l'étudiant choisit son pas,
# fait son programme du jour en deux fois, retrouve tout après rechargement ; le temps avance (mode essai), un jour est
# manqué, le pas change ; un paquet sans jours conseillés garde son fonctionnement habituel.
import sys, json
from playwright.sync_api import sync_playwright

url, out = sys.argv[1], sys.argv[2]
csv = sys.argv[3] if len(sys.argv) > 3 else ''
student = url.split('enseignant.html')[0] + 'index.html'
errors = []
KV = """async key => { const db = await new Promise((res, rej) => { const r = indexedDB.open('elefiches'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => { db.close(); res(JSON.stringify(q.result ?? null)); }; }); }"""
STEP = """(() => { const s = window.__elefiches.step; if (!s) return null; const a = s.activity || {};
  return { intro: !!s.intro, type: a.type || '', accepted: a.accepted || null, options: a.options || null, answer: a.answer ?? null, left: a.left ? a.left.map(x => x.id) : null, hint: a.hint || '' }; })()"""

def play(page, stop_after=0, seen=None, slow_first=False):
    """Joue la séance en répondant juste. stop_after : nombre de réponses écrites après lequel on quitte la séance."""
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

    # 0. Sans jours conseillés : rien ne change (« Appétit du jour », bouton de séance minuté).
    assert page.locator('.appetite').count() == 1 and page.locator('.deck [data-action=start]').count() == 1 and not page.locator('.planline').count()

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

    # 2. Côté étudiant : la carte du paquet invite à choisir un pas ; « Appétit du jour » disparaît (tous les paquets ont un plan).
    page.click('[data-action=home]'); page.wait_for_selector('.deck [data-action=plan]')
    assert not page.locator('.appetite').count() and str(n_cards) in txt('.planline') and narrow()
    page.click('.deck [data-action=plan]'); page.wait_for_selector('.paces')
    names = page.locator('.pace h2').all_inner_texts(); assert names == ['Patte de velours', 'Patte trotteuse', 'Patte pressée'], names
    prints = [page.locator('.pace').nth(i).locator('.trail .paw').count() for i in range(3)]; assert prints == [9, 6, 4], prints
    assert page.locator('.pace').nth(1).locator('.tag.ok').inner_text() == 'Conseillé par ton cours' and page.locator('.pace .primary').count() == 1
    assert all('environ' in x and 'min par jour' in x for x in page.locator('.pace .big').all_inner_texts())
    assert 'Au bout des 6 jours conseillés' in page.locator('.pace').nth(0).inner_text().replace('\u00a0', ' '), 'le pas lent dit ce qui sera prêt au bout des jours conseillés'
    assert 'tu auras vu tous les mots au moins une fois' in txt('.planlead.why')
    assert narrow(); page.screenshot(path=out + '/plan-1-pas.png', full_page=True)

    # 3. Un geste : le pas choisi, la première journée commence. Pas d'écran de découverte, première question écrite.
    page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.study')
    first = page.evaluate(STEP); assert first['type'] == 'type' and not first['intro'] and first['hint'], first
    assert not page.locator('.intro').count() and page.locator('form.typed').count() == 1
    page.screenshot(path=out + '/plan-2-question.png', full_page=True)
    plan = state(f"progress['{did}']._plan"); per_day = -(-n_cards // 3)
    assert plan['pace'] == 'mid' and plan['days'] == 6 and plan['day'] == 0 and plan['fresh'] == per_day and plan['est'] >= 1, plan
    kinds = set(); done = play(page, stop_after=2, seen=kinds, slow_first=True); assert done == 2 and 'intro' not in kinds

    # 4. Programme du jour en deux fois : la carte dit ce qui reste, la barre avance, le bouton propose de continuer.
    line = txt('.todayline'); assert f'mots nouveaux {per_day - 2}' in line and 'révisions 0' in line and 'environ' in line, line
    assert page.get_attribute('.daybar', 'aria-valuenow') == str(round(100 * 2 / per_day)) and 'Continuer' in page.inner_text('.deck [data-action=start]')
    assert 'jour 1 sur 6' in txt('.planline') and page.locator('.planline .paw').count() == 6 and page.locator('.planline .paw.todo').count() == 5
    mile = txt('.milestone'); assert 'Objectif du cours, jour 6' in mile and f'mots vus 2 sur {n_cards}' in mile and 'rappelés un autre jour 0 sur' in mile, mile
    assert narrow(); page.screenshot(path=out + '/plan-3-carte.png', full_page=True)
    page.click('.deck [data-action=start]'); play(page, seen=kinds); page.wait_for_selector('.done')
    assert 'Journée faite' in txt('.planwin') and not page.locator('.done [data-action=start]').count(), 'journée faite : rien de plus à faire aujourd’hui'
    page.screenshot(path=out + '/plan-4-journee-faite.png', full_page=True)
    page.click('.done [data-action=home]'); page.wait_for_selector('.deck .rest'); assert 'Journée faite' in txt('.deck .rest') and not page.locator('.deck [data-action=start]').count()

    # 5. Tout est conservé : plan, progression et mesure locale survivent au rechargement.
    page.reload(); page.wait_for_selector('.deck .rest')
    P = kv('progress:' + did); born = [k for k, v in P.items() if not k.startswith('_')]
    assert P['_plan']['pace'] == 'mid' and P['_plan']['last'] == 0 and len(born) == per_day and all(P[k]['box'] == 2 for k in born), P['_plan']
    M = kv('mesure'); assert M['tries'] == per_day and M['ok'] == per_day and len(M['t']) >= 1, M

    # 6. Interface étudiant : le plan y est, l'espace enseignant n'y est pas.
    page.goto(student); page.wait_for_selector('.deck .rest'); assert page.locator('.planline').count() == 1 and not page.locator('[data-action=teacher]').count()
    page.click('[data-action=rules]'); assert 'Patte de velours' in page.inner_text('#app'); page.click('[data-action=home]')
    page.click('[data-action=privacy]'); assert 'Ta vitesse et tes réussites' in page.inner_text('#app')

    # 7. Le temps avance (mode essai de l'enseignant) : jour 2, puis un jour manqué, puis changement de pas.
    page.goto(url); page.wait_for_selector('.deck'); page.click('[data-action=teacher]'); page.click('[data-action=sb-on]'); page.wait_for_selector('section.sandbox')
    page.click('.deck [data-action=plan]'); page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.study'); play(page)
    page.click('.done [data-action=home]'); page.wait_for_selector('.deck .rest')
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.todayline')
    assert 'jour 2 sur 6' in txt('.planline') and f'mots nouveaux {-(-(n_cards - per_day) // 2)}' in txt('.todayline'), txt('.deck')
    assert kv('progress:' + did)['_plan']['last'] == 0 and len([k for k in kv('essai:' + did) if not k.startswith('_')]) == per_day, 'la vraie progression ne bouge pas'
    page.click('[data-action=sb-skip][data-days="1"]'); page.wait_for_selector('.planmiss')
    miss = txt('.planmiss'); assert 'Jours sans séance : 1' in miss, miss
    assert 'jour 3 sur 6' in txt('.planline'); page.screenshot(path=out + '/plan-5-jour-manque.png', full_page=True)
    page.click('.deck [data-action=start]'); play(page); page.click('.done [data-action=home]'); page.wait_for_selector('.deck .rest')
    sb = state(f"progress['{did}']._plan"); assert sb['missed'] == 1 and sb['ack'] == 1 and sb['last'] == 2, sb
    assert not page.locator('.planmiss').count(), 'jour manqué annoncé une fois, pas davantage'
    page.click('.deck [data-action=plan]'); page.wait_for_selector('.pace.current'); assert 'Trotteuse'.lower() in page.inner_text('.pace.current').lower() and 'Jours restants' in txt('.paces')
    page.screenshot(path=out + '/plan-6-changer.png', full_page=True)
    page.click('[data-action=pace][data-pace=slow]'); page.wait_for_selector('.banner.good'); assert 'Patte de velours' in page.inner_text('.banner.good') and 'Patte de velours' in txt('.planline')
    sb = state(f"progress['{did}']._plan"); assert sb['pace'] == 'slow' and sb['days'] == 9 and sb['start'] and 'jour 3 sur 9' in txt('.planline'), sb
    page.click('[data-action=sb-off]'); page.wait_for_selector('.sbcard')

    # 8. Un second paquet, sans jours conseillés : il garde « Appétit du jour » et sa séance minutée, à côté du paquet à plan.
    page.click('summary:has-text("Faire le paquet à la main")'); page.click('[data-action=try][data-model=fr]'); page.wait_for_selector('.deck')
    assert page.locator('.appetite').count() == 1 and page.locator('.deck').count() == 2
    cards = page.locator('.deck'); plain = [i for i in range(2) if not cards.nth(i).locator('.planline').count()]
    assert len(plain) == 1 and 'min' in cards.nth(plain[0]).locator('[data-action=start]').inner_text()
    cards.nth(plain[0]).locator('[data-action=start]').click(); page.wait_for_selector('.intro'); page.click('[data-action=quit]')
    page.set_viewport_size({'width': 1100, 'height': 800}); page.click('.deck [data-action=plan]'); page.wait_for_selector('.paces'); page.screenshot(path=out + '/plan-7-large.png', full_page=True)

    # 8 bis. Un fichier qui règle lui-même le rythme (écrit par une IA ou par un tiers) : l'import le dit à l'enseignant.
    page.set_viewport_size({'width': 390, 'height': 844}); page.click('[data-action=home]'); page.click('[data-action=teacher]'); page.wait_for_selector('form[data-submit=import]')
    page.evaluate("document.querySelectorAll('form[data-submit=import] details').forEach(d => { d.open = true; })")
    page.fill('form[data-submit=import] textarea[name=text]', json.dumps({**exported, 'days': 5})); page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.banner.good')
    warn = txt('.banner.good'); assert 'règle lui-même le rythme' in warn and 'jours conseillés 5' in warn and 'classe : oui' in warn, warn
    assert [d for d in state('decks.map(d => ({ id: d.id, days: d.days }))') if d['id'] == did][0]['days'] == 5

    # 9. Longue liste (si un CSV est fourni) : jours conseillés saisis à l'import. Deux jours manqués se rattrapent pour
    # cinq minutes de plus par jour au plus : simple annonce. Au troisième, l'écart dépasse cinq minutes : l'étudiant
    # choisit entre garder la fin et garder ses minutes.
    if csv:
        page.click('[data-action=teacher]'); page.wait_for_selector('form[data-submit=import]')
        page.click('summary:has-text("Pour un fichier CSV")'); page.fill('form[data-submit=import] input[name=name]', 'Longue liste (A2)'); page.select_option('form[data-submit=import] select[name=level]', 'A2')
        page.click('form[data-submit=import] summary:has-text("Rythme")'); page.fill('form[data-submit=import] input[name=days]', '6'); page.set_input_files('input[name=files]', csv)
        page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.banner.good')
        long = [d for d in state('decks.map(d => ({ id: d.id, name: d.name, days: d.days || 0, seen: d.seen === true, n: d.cards.length }))') if d['name'] == 'Longue liste (A2)'][0]
        assert long['days'] == 6 and not long['seen'] and long['n'] > 60, long
        page.click('[data-action=teacher]'); page.click('[data-action=sb-on]'); page.wait_for_selector('section.sandbox')
        page.click(f'.deck [data-action=plan][data-id="{long["id"]}"]'); page.wait_for_selector('.paces'); page.screenshot(path=out + '/plan-8-longue-liste.png', full_page=True)
        assert 'jusqu’à' in txt('.paces'), 'les jours de découverte sont plus chargés : l’écran le dit'
        page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.intro'); page.click('[data-action=quit]'); page.wait_for_selector('.deck')      # mots non vus en classe : l'écran de découverte reste
        mine = f'.deck:has([data-action=plan][data-id="{long["id"]}"])'
        day = lambda n: page.wait_for_selector(mine + f' .planline:has-text("jour {n} sur 6")')      # un saut à la fois : le suivant n'est accepté qu'une fois le premier fini
        page.click('[data-action=sb-skip][data-days="1"]'); day(2); page.click('[data-action=sb-skip][data-days="1"]'); day(3)
        assert 'Jours sans séance : 2' in txt(mine + ' .planmiss') and not page.locator(mine + ' [data-action=plan-keep]').count(), txt(mine + ' .planmiss')
        page.click('[data-action=sb-skip][data-days="1"]'); day(4); page.wait_for_selector(mine + ' .planmiss [data-action=plan-keep]')
        ask = txt(mine + ' .planmiss'); assert 'Jours sans séance : 3' in ask and 'Finir comme prévu' in ask and 'plus tard' in ask, ask
        page.screenshot(path=out + '/plan-9-choix.png', full_page=True)
        page.click(mine + ' .planmiss [data-action=plan-keep][data-v=min]'); page.wait_for_selector(mine + ' .planmiss', state='detached')
        lp = state(f"progress['{long['id']}']._plan"); assert lp['days'] == 9 and lp['ack'] == 3 and 'jour 4 sur 9' in txt(mine + ' .planline'), lp
        page.click('[data-action=sb-off]'); page.wait_for_selector('.sbcard')

    print('ERREURS CONSOLE:', errors or 'aucune'); assert not errors, errors
    b.close()
print('test du plan personnel réussi')
