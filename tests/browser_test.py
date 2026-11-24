# Test de bout en bout : python3 tests/browser_test.py <url de enseignant.html#accueil> <csv> <dossier de captures>
# L'interface enseignant sert au parcours complet ; l'interface étudiant (index.html) est vérifiée à part.
import sys, re
from playwright.sync_api import sync_playwright

url, csv, out = sys.argv[1], sys.argv[2], sys.argv[3]
student = url.split('enseignant.html')[0] + 'index.html'
from PIL import Image
png = out + '/_test.png'; Image.new('RGB', (1200, 800), (255, 122, 89)).save(png)
errors = []

# Planche de test : neuf cases de couleurs différentes, pour vérifier le découpage.
COLORS = [(230, 60, 60), (60, 200, 80), (60, 90, 230), (240, 220, 40), (150, 60, 200), (40, 200, 210), (250, 140, 30), (120, 120, 120), (240, 120, 180)]
sheet = out + '/_planche1.png'; im = Image.new('RGB', (900, 900), (255, 255, 255))
for i, col in enumerate(COLORS): im.paste(Image.new('RGB', (280, 280), col), (i % 3 * 300 + 10, i // 3 * 300 + 10))
im.save(sheet)
import json, zipfile, os
PACKET = json.dumps({"elefiches": 1, "name": "Logement (B1)", "lang": "fr", "level": "B1", "cards": [
    {"word": "Un " + w, "pos": "nom", "definition": d, "translations": {}, "examples": ["Je paie un [" + w + "] chaque mois ici.", "Le [" + w + "] est sur la table."], "situation": s, "distractors": ["garage", "voisin", "placard"], "theme": "Logement", "register": "courant", "image": im_}
    for w, d, s, im_ in [("loyer", "Argent payé chaque mois pour habiter un logement.", "On est le premier du mois.", "P1-1"), ("bail", "Contrat entre le propriétaire et la personne qui loue.", "Tu signes un papier avec le propriétaire.", "P1-5"),
                         ("garant", "Personne qui promet de payer si tu ne peux pas.", "Le propriétaire veut une sécurité.", "P1-9"), ("préavis", "Délai à respecter avant de quitter un logement.", "Tu veux partir dans trois mois.", "")]]}, ensure_ascii=False)
zpath = out + '/_paquet.zip'
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('paquet.json', PACKET.replace('Logement (B1)', 'Logement zip (B1)')); z.write(sheet, 'planche1.png')

def play(page, right=True, shots=None, near=False):
    """Joue une session ou un défi en entier. right=True répond juste quand c'est possible."""
    kinds = set()
    def shot(name, full=False):
        if shots is not None and name not in shots: shots[name] = True; page.screenshot(path=f'{out}/{name}.png', full_page=full)
    for _ in range(300):
        if page.locator('.done').count():
            return kinds
        if page.locator('.intro').count():
            kinds.add('intro'); page.click('[data-action=next]'); continue
        if page.locator('.feedback').count():
            if page.locator('.win').count(): shot('win', True)
            if page.locator('.explain').count(): shot('explain', True)
            if page.locator('[data-action=felt]').count():
                kinds.add('felt'); shot('felt', True); page.click('[data-action=felt][data-v=easy]')
            else: page.click('.feedback [data-action=next]')
            continue
        kind = page.evaluate("window.__elefiches.step.activity.type"); kinds.add(kind)
        if page.locator('[data-action=reveal]').count():
            kinds.add('gate'); shot('gate'); assert not page.locator('.option').count(), 'les choix restent cachés avant le rappel de tête'
            page.click('[data-action=reveal]')
        if kind == 'recall':      # dernier recours : retrouver le mot de tête, le découvrir, se juger
            word = page.evaluate("window.__elefiches.step.card.bare")
            assert not page.locator('.study h2.word').count(), 'rappel de tête : le mot n’est pas montré avant'
            page.click('[data-action=reveal-self]'); assert word in page.inner_text('.study h2.word'); shot('recall', True)
            page.click('[data-action=self][data-v=good]' if right else '[data-action=self][data-v=again]')
            continue
        if kind in ('speak', 'sentence'):         # formes où l'étudiant se juge lui-même en comparant avec un modèle
            shot(kind, True)
            before = page.evaluate("window.__elefiches.state.session.stats.answered")
            if kind == 'speak':      # la phrase entière est à l'écran dès le début, avec le mot en gras
                model = page.evaluate("window.__elefiches.step.activity.model")
                assert page.inner_text('.saythis').strip() == model and len(model.split()) >= 2, ('oral : la phrase entière', model)
                assert page.locator('.saythis b.target').count() == 1, 'oral : le mot étudié est en gras dans la phrase'
            if kind == 'sentence': page.fill('textarea[name=mine]', 'Ma phrase.')
            page.click('[data-action=reveal-self]'); shot(kind + '_check', True)
            if kind == 'speak':
                assert page.locator('[data-action=say-sentence]').count() == 1 and page.locator('[data-action=shadow]').count() == 1, 'oral : écouter le modèle, puis répéter avec la voix'
                assert page.inner_text('.saythis').strip() == model, 'oral : la même phrase avant et après'
            if kind == 'sentence':
                assert 'Ma phrase.' in page.inner_text('.mine'), 'la phrase de l’étudiant est gardée pour la comparaison'
                n = page.evaluate("window.__elefiches.step.activity.models.length"); assert page.locator('.models li').count() == n <= 4
                assert page.locator('.models b.target').count() >= 1, 'le mot étudié est en gras dans les phrases modèles'
            # « Recommencer » ramène au début de l'exercice sans rien noter
            page.click('[data-action=self-retry]')
            assert page.locator('[data-action=reveal-self]').count() == 1 and not page.locator('.feedback').count(), 'recommencer : retour au début'
            assert page.evaluate("window.__elefiches.state.session.stats.answered") == before, 'recommencer ne compte pas comme une réponse'
            if kind == 'sentence': assert page.input_value('textarea[name=mine]') == 'Ma phrase.', 'la phrase écrite reste là pour être corrigée'
            page.click('[data-action=reveal-self]')
            page.click('[data-action=self][data-v=good]' if right else '[data-action=self][data-v=again]')
            continue
        if kind == 'listen': assert not page.locator('.study h2.word').count(), 'écoute : le mot ne doit pas être écrit avant la réponse'
        if kind == 'order':
            sol = page.evaluate("window.__elefiches.step.activity.solution")
            texts = page.locator('.bank .chunk').all_inner_texts()
            assert not any(re.search(r'[.!?…]$', x) for x in texts), ('morceaux sans ponctuation finale', texts)
            if not right: page.click('[data-action=skip]')
            else:
                first = True
                for text in sol:
                    c = page.locator('.bank .chunk', has_text=re.compile('^' + re.escape(text) + '$')).first
                    if first and shots is not None and 'drag' not in shots:      # premier morceau : glissé à la souris
                        shots['drag'] = True; a = c.bounding_box(); z = page.locator('.line').bounding_box()
                        page.mouse.move(a['x'] + a['width'] / 2, a['y'] + a['height'] / 2); page.mouse.down()
                        page.mouse.move(z['x'] + 40, z['y'] + 30, steps=8); page.mouse.up()
                        assert page.locator('.line .chunk').count() == 1, 'le glisser-déposer doit poser le morceau sur la ligne'
                    else: c.click()
                    first = False
                shot('order'); page.click('[data-action=check-order]')
        elif kind == 'match':
            shot('match', True); page.wait_for_timeout(250)
            assert not page.evaluate("window.__spoken.length"), ('association : aucun son avant de toucher un mot', page.evaluate("window.__spoken"))
            for pid in page.evaluate("window.__elefiches.step.activity.left.map(p => p.id)"):
                page.evaluate("window.__spoken.length = 0"); page.click(f'.tile[data-side=l][data-id="{pid}"]')
                said = page.evaluate("window.__spoken.slice()"); word = page.evaluate("id => window.__elefiches.state.session.deck.byId[id].bare", pid)
                if page.evaluate("window.__elefiches.state.voice"): assert len(said) == 1 and said[0].strip(), ('association : chaque mot touché se fait entendre, et lui seul', word, said)
                page.evaluate("window.__spoken.length = 0"); page.click(f'.tile[data-side=r][data-id="{pid}"]')
        elif kind == 'bank':
            n = page.evaluate("window.__elefiches.step.activity.items.length")
            page.wait_for_timeout(250)
            assert page.locator('.banklist .cue').count() == 0, 'phrases à compléter : aucun indice au premier essai, il faut lire la phrase'
            answers = page.evaluate("window.__elefiches.step.activity.items.map(i => i.answer)")
            if 'bank-retry' not in kinds and len(set(answers)) == len(answers):      # une fois : deux réponses échangées, puis second essai avec indice
                kinds.add('bank-retry')
                for ans in [answers[1], answers[0]] + answers[2:]:
                    page.locator('.bank .chunk:not(:disabled)', has_text=re.compile('^' + re.escape(ans) + '$')).first.click()
                page.click('[data-action=check-bank]')
                assert page.locator('p.again').count() == 1 and not page.locator('.feedback').count(), 'second essai proposé, rien n’est encore noté'
                assert page.locator('.banklist .cue').count() == 2 and all(x.strip() for x in page.locator('.banklist .cue').all_inner_texts()), 'indice de sens sur les deux phrases manquées seulement'
                assert page.locator('.banklist .slot:disabled').count() == n - 2, 'les phrases justes sont gardées'
                shot('bank_retry', True)
                for ans in answers[:2]:
                    page.locator('.bank .chunk:not(:disabled)', has_text=re.compile('^' + re.escape(ans) + '$')).first.click()
                page.click('[data-action=check-bank]'); page.evaluate("window.__spoken.length = 0")
                assert page.locator('.feedback').count() == 1 and page.locator('[data-action=say-line]').count() == n and page.locator('.banklist .cue').count() == n
                continue
            assert not page.evaluate("window.__spoken.length"), ('phrases à compléter : aucun son automatique', page.evaluate("window.__spoken"))
            for ans in page.evaluate("window.__elefiches.step.activity.items.map(i => i.answer)"):
                page.locator('.bank .chunk:not(:disabled)', has_text=re.compile('^' + re.escape(ans) + '$')).first.click()
            shot('bank', True); page.click('[data-action=check-bank]'); page.evaluate("window.__spoken.length = 0")
            assert page.locator('[data-action=say-line]').count() == n, 'après validation : un bouton d’écoute par phrase'
        elif kind in ('cloze-type', 'situation-type', 'type', 'number', 'listen-type'):
            ans = page.evaluate("(a => a.cloze || a.type === 'number' ? a.answer : a.accepted[0])(window.__elefiches.step.activity)")
            shot(kind)
            if near and 'near' not in kinds and len(ans) >= 5:        # une lettre en trop : second essai (B1) ou acceptation corrigée (A1, A2)
                kinds.add('near'); page.fill('input[name=answer]', ans + 'x'); page.press('input[name=answer]', 'Enter')
                if page.locator('p.again').count(): kinds.add('second-try'); shot('second_try'); page.fill('input[name=answer]', ans); page.press('input[name=answer]', 'Enter')
                else: assert 'Accepté' in page.inner_text('.feedback'), page.inner_text('.feedback'); kinds.add('accepted'); shot('accepted', True)
            else:
                page.fill('input[name=answer]', ans if right else 'zzzz'); page.press('input[name=answer]', 'Enter')
        else:
            # la bonne réponse est connue du test via l'état interne exposé par la page
            ans = page.evaluate("window.__elefiches.step.activity.answer")
            opts = page.locator('.option')
            texts = page.evaluate("window.__elefiches.step.activity.options")      # les choix peuvent être des images : on lit l'état, pas l'écran
            assert ans in texts and opts.count() == len(texts), (ans, texts)
            if page.evaluate("!!window.__elefiches.step.activity.pics"): kinds.add('pics'); assert page.locator('.option.pic img').count() == len(texts)
            idx = texts.index(ans) if right else (texts.index(ans) + 1) % len(texts)
            shot(kind)
            opts.nth(idx).click()
        assert page.locator('.feedback').count() == 1, kind
    raise AssertionError('session sans fin')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = b.new_page(viewport={'width': 420, 'height': 860})
    # Journal de ce que l'appli demande à la voix : sert à vérifier quel son part, et quand.
    page.add_init_script("window.__spoken = []; /* seulement les sons demandés pendant un exercice à plusieurs mots */ try { const s = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { if (!window.__elefiches?.step?.activity?.multi) return s(u); window.__spoken.push(u.text); return s(u); }; } catch (e) {}")
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_selector('.deck')
    page.screenshot(path=f'{out}/home.png', full_page=True)

    page.click('[data-action=start]')
    page.wait_for_selector('.intro'); page.screenshot(path=f'{out}/intro.png')
    shots = {}
    k1 = play(page, right=False, shots=shots)
    page.screenshot(path=f'{out}/done.png')
    assert 'intro' in k1 and 'qcm' in k1, k1
    page.click('[data-action=home]')
    assert 'Commencer' in page.inner_text('body'), 'interface en français par défaut'

    # la progression survit à un rechargement
    page.reload(); page.wait_for_selector('.deck')
    assert page.locator('.deck').first.locator('.prairie .ele').count() == 3, 'trois éléphanteaux attendus après la première session'

    # espace enseignant : tutoriel, modèles, import du CSV réel
    page.click('[data-action=teacher]'); page.wait_for_selector('[data-b=level]')
    # le prompt n'apparaît qu'une fois le niveau choisi, puis suit ce que l'enseignant décrit
    assert 'Choisis d’abord le niveau' in page.inner_text('pre[data-prompt=file]')
    page.select_option('[data-b=lang]', 'en'); page.select_option('[data-b=level]', 'B2')
    page.fill('[data-b=topic]', 'Job interviews'); page.fill('[data-b=count]', '120')
    pr = page.inner_text('pre[data-prompt=file]'); assert 'paquet de 120 fiches' in pr and 'UN SEUL fichier ZIP' in pr
    assert 'niveau B2' in pr and 'Job interviews' in pr and '"lang":"en","level":"B2"' in pr and '"translations":{"fr":""}' in pr, pr[:200]
    assert page.input_value('[data-b=topic]') == 'Job interviews'
    page.screenshot(path=f'{out}/teacher.png', full_page=True)
    page.click('details.card.more > summary'); page.wait_for_selector('.models')
    page.locator('[data-action=try][data-model=es]').click(); page.wait_for_selector('.deck')
    assert page.locator('.deck').count() == 2
    page.locator('.deck').nth(1).locator('[data-action=start]').click()
    page.wait_for_selector('.intro'); page.screenshot(path=f'{out}/intro_es.png')
    assert 'Un rendez-vous' in page.inner_text('.intro'), 'traduction française attendue'
    page.click('[data-action=quit]')
    page.click('details.settings summary'); page.screenshot(path=f'{out}/settings.png', full_page=True); page.click('[data-action=set][data-key=help][data-value=en]')
    page.locator('.deck').nth(1).locator('[data-action=start]').click(); page.wait_for_selector('.study')
    assert page.evaluate("window.__elefiches.state.session.deck.help") == 'en', 'traduction anglaise attendue'
    page.click('[data-action=quit]')
    page.click('details.settings summary'); page.click('[data-action=set][data-key=help][data-value=fr]')
    # éditeur : renommer un paquet, modifier une définition, ajouter une image, créer une fiche
    page.click('[data-action=teacher]')
    page.locator('.decklist [data-action=edit]').nth(1).click(); page.wait_for_selector('.cardlist')
    page.fill('form[data-submit=rename] input[name=name]', 'Español A2'); page.click('form[data-submit=rename] button.primary')
    page.wait_for_selector('.banner.good')
    page.fill('input[data-input=search]', 'madrug'); assert page.locator('.cardlist li:visible').count() == 1
    page.locator('.cardlist li:visible .cardrow').click(); page.wait_for_selector('form[data-submit=card]')
    page.fill('textarea[name=definition]', 'Levantarse muy pronto.')
    page.set_input_files('input[data-file=image]', png)
    page.wait_for_selector('[data-preview=image]:not([hidden])')      # la règle de sécurité du site interdit l'évaluation de texte : on attend un élément
    assert page.input_value('textarea[name=definition]') == 'Levantarse muy pronto.', 'la saisie ne doit pas être effacée par l’ajout d’image'
    page.screenshot(path=f'{out}/card_edit.png', full_page=True)
    page.click('form[data-submit=card] button.primary'); page.wait_for_selector('.cardlist')
    assert page.locator('.cardrow img').count() == 1
    page.click('[data-action=card][data-id=new]'); page.fill('input[name=word]', 'La merienda')
    page.fill('input[name=tr_fr]', 'Le goûter'); page.fill('textarea[name=examples]', 'Tomamos la merienda a las cinco.')
    page.click('form[data-submit=card] button.primary'); page.wait_for_selector('.cardlist')
    assert page.locator('.cardlist li').count() == 5
    page.screenshot(path=f'{out}/deck_edit.png', full_page=True)
    page.reload(); page.wait_for_selector('.deck')
    assert 'Español A2' in page.inner_text('body'), 'le nouveau nom doit survivre au rechargement'
    st = page.evaluate("(() => { const d = window.__elefiches.state.decks[1]; const c = d.cards.find(x => x.word === 'Madrugar'); return [c.definition, (c.image||'').slice(0,11), d.cards.length, d.cards[4].clozes.length]; })()")
    assert st == ['Levantarse muy pronto.', 'data:image/', 5, 1], st
    # paquet collé + planche : les dessins sont découpés et posés sur les bonnes fiches
    page.click('[data-action=teacher]')
    page.evaluate("document.querySelectorAll('form[data-submit=import] details').forEach(d => { d.open = true; })")
    page.fill('form[data-submit=import] textarea[name=text]', '```json\n' + PACKET + '\n```\nPlanche 1 : …')
    page.set_input_files('input[name=files]', sheet)
    page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.imggrid')
    page.screenshot(path=f'{out}/images.png', full_page=True)
    px = page.evaluate("""async () => { const d = window.__elefiches.state.decks.find(x => x.name === 'Logement (B1)'); const out = [];
      for (const c of d.cards) { if (!c.image) { out.push(null); continue; } const im = new Image(); im.src = c.image; await im.decode();
        const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
        out.push([...g.getImageData(im.width >> 1, im.height >> 1, 1, 1).data].slice(0, 3)); } return [d.level, out]; }""")
    assert px[0] == 'B1' and px[1][3] is None, px
    for got, want in zip(px[1][:3], [COLORS[0], COLORS[4], COLORS[8]]): assert all(abs(a - b) < 30 for a, b in zip(got, want)), (got, want)
    page.click('button.primary[data-action=teacher]')
    # le même paquet dans une archive : un seul fichier à déposer
    page.set_input_files('input[name=files]', zpath); page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.imggrid')
    assert page.locator('.imgtile img').count() == 3, 'archive : trois dessins attendus'
    page.click('button.primary[data-action=teacher]')
    # image isolée, sans nom reconnaissable : l'enseignant touche le mot qu'elle illustre
    page.evaluate("document.querySelectorAll('form[data-submit=import] details').forEach(d => { d.open = true; })")
    page.fill('form[data-submit=import] textarea[name=text]', PACKET.replace('Logement (B1)', 'Logement libre (B1)').replace('"P1-', '"'))
    page.set_input_files('input[name=files]', png); page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.loose')
    page.locator('.imgtile').nth(1).click(); assert page.locator('.imgtile img').count() == 1 and not page.locator('.loose').count()
    page.click('button.primary[data-action=teacher]')
    # paquet Anki (.apkg) : un seul fichier, fiches et images comprises
    import sqlite3
    dbp = out + '/_c.anki21'
    if os.path.exists(dbp): os.remove(dbp)
    c = sqlite3.connect(dbp)
    c.execute('create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)')
    c.execute('create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)')
    c.execute('insert into col values (1,0,0,0,11,0,0,0,?,?,?,?,?)', ('{}', json.dumps({'1730000000000': {'name': 'Voc', 'flds': [{'name': n, 'ord': i} for i, n in enumerate(['Word', 'Image', 'Definition', 'Example', 'Category'])]}}), json.dumps({'1': {'name': 'Default'}, '2': {'name': 'Week-end à Londres'}}), '{}', '{}'))
    for i, r in enumerate([('Sale / sale', '<img src="card_001.png">', "Qui n'est pas propre.", 'La salle de bains est sale.', 'Hôtel'), ('Un oreiller', '<img src="card_002.png">', 'On pose la tête dessus pour dormir.', 'Je voudrais un oreiller en plus.', 'Hôtel'), ('Une valise', '', 'Un grand sac rigide pour voyager.', 'Ma valise est trop lourde.', 'Voyage'), ('Un ascenseur', '', 'Il monte et descend dans un immeuble.', "L'ascenseur de l'hôtel est en panne.", 'Hôtel')]):
        c.execute('insert into notes values (?,?,?,0,0,?,?,?,0,0,?)', (i + 1, 'g%d' % i, 1730000000000, '', chr(31).join(r), r[0], ''))
    c.commit(); c.close()
    apath = out + '/_A1SQ2_Week-end.apkg'
    with zipfile.ZipFile(apath, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(dbp, 'collection.anki21'); z.writestr('media', json.dumps({'0': 'card_001.png', '1': 'card_002.png'})); z.write(png, '0'); z.write(sheet, '1')
    page.set_input_files('input[name=files]', apath); page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.imggrid')   # un fichier complet ouvre la vérification des images
    assert page.locator('.imggrid img').count() == 2
    ank = page.evaluate("(d => [d.level, d.cards.length, d.cards.filter(c => (c.image || '').startsWith('data:image/')).length, d.cards[0].clozes.length])(window.__elefiches.state.decks.find(d => d.name === 'Week-end à Londres'))")
    assert ank == ['A1', 4, 2, 1], ank
    page.click('[data-action=teacher]')
    # fichier CSV : le niveau doit être choisi, il n'est jamais deviné en silence
    page.evaluate("document.querySelectorAll('form[data-submit=import] details').forEach(d => { d.open = true; })")
    page.fill('form[data-submit=import] input[name=name]', 'Sans niveau'); page.set_input_files('input[name=files]', csv)
    page.click('form[data-submit=import] button.primary'); page.wait_for_selector('.banner.warn')
    assert 'niveau' in page.inner_text('.banner.warn')
    page.evaluate("document.querySelectorAll('form[data-submit=import] details').forEach(d => { d.open = true; })")
    page.fill('form[data-submit=import] input[name=name]', 'A2+ test'); page.set_input_files('input[name=files]', csv)
    page.click('form[data-submit=import] button.primary')
    page.wait_for_selector('.deck')
    print('IMPORT:', page.locator('.banner.good').inner_text())
    # Version 13 : ce tableau n'a pas de colonne « nature ». Le paquet est accepté, une alerte invite à classer les mots.
    alert = page.locator('.banner.warn', has_text='à compléter'); assert alert.count() == 1, 'alerte de classement attendue'
    alert.locator('[data-action=sort]').click(); page.wait_for_selector('.sortgroup')
    page.screenshot(path=f'{out}/sort_before.png', full_page=True)
    groups = page.locator('section[data-sort=kind] > fieldset.sortgroup legend').all_inner_texts(); print('CLASSEMENT SUGGÉRÉ:', groups)
    assert any('nom' in g and '59' in g for g in groups) and any('verbe' in g for g in groups) and any('préposition' in g and '13' in g for g in groups), groups
    # un mot mal rangé : on le coche et on le range ailleurs (action par lot), puis on le remet
    page.click('[data-action=sort-move]'); assert page.locator('.toast').count() >= 0
    box = page.locator('section[data-sort=kind] > fieldset.sortgroup', has_text='Suggestion : verbe').locator('input[name=pick]')
    box.nth(0).check(); box.nth(1).check(); page.select_option('[data-sortkind]', 'expression'); page.click('[data-action=sort-move]')
    page.wait_for_selector('.banner.good'); assert '2 fiche' in page.inner_text('.banner.good'), page.inner_text('.banner.good')
    page.evaluate("document.querySelectorAll('section[data-sort=kind] details').forEach(d => { d.open = true; })")
    done = page.locator('section[data-sort=kind] details fieldset', has_text='expression').locator('input[name=pick]'); assert done.count() == 2
    done.nth(0).check(); done.nth(1).check(); page.select_option('[data-sortkind]', 'verbe'); page.click('[data-action=sort-move]'); page.wait_for_selector('.banner.good')
    # chaque groupe suggéré est confirmé d'un geste
    while page.locator('[data-action=sort-confirm]').count(): page.locator('[data-action=sort-confirm]').first.click(); page.wait_for_timeout(150)
    assert page.locator('section[data-sort=kind] > fieldset.sortgroup').count() == 0, 'tout est classé'
    # genre des noms dont l'article ne dit rien : par lot aussi
    g = page.locator('section[data-sort=gender] > ul.picks input[name=gpick]'); n_g = g.count(); assert n_g == 21, n_g
    for i in range(n_g):
        if i % 2 == 0: g.nth(i).check()
    page.click('[data-action=sort-gender][data-g=m]'); page.wait_for_selector('.banner.good')
    g = page.locator('section[data-sort=gender] > ul.picks input[name=gpick]'); assert g.count() == 10, g.count()
    for i in range(g.count()): g.nth(i).check()
    page.click('[data-action=sort-gender][data-g=f]'); page.wait_for_selector('.banner.good')
    assert page.locator('section[data-sort=gender] > ul.picks').count() == 0, 'tous les noms ont un genre'
    page.screenshot(path=f'{out}/sort_after.png', full_page=True)
    page.reload(); page.wait_for_selector('.deck')
    saved = page.evaluate("window.__elefiches.state.decks.at(-1).cards.filter(c => c.pos).length + '/' + window.__elefiches.state.decks.at(-1).cards.filter(c => c.gender).length"); print('CLASSEMENT ENREGISTRÉ (catégories/genres):', saved); assert saved == '85/21', saved
    N = page.locator('.deck').count() - 1; assert N == 6, N
    page.locator('.deck').nth(N).locator('[data-action=start]').click()
    k2 = play(page, right=True, shots=shots)
    page.screenshot(path=f'{out}/done_win.png')
    assert 'apprivois' in page.inner_text('.done')
    page.click('[data-action=home]')

    # avance de l'horloge pour faire monter les fiches jusqu'aux activités écrites
    kinds = set()
    for day in list(range(1, 30)) + list(range(32, 90, 4)):
        page.evaluate(f"(() => {{ const real = Date.now.bind(Date); const off = {day} * 86400000 * 2; if (!window.__realNow) window.__realNow = real; Date.now = () => window.__realNow() + off; }})()")
        page.evaluate("window.__elefiches.rerender()")
        btn = page.locator('.deck').nth(N).locator('[data-action=start]')
        if not btn.count(): continue
        btn.click()
        kinds |= play(page, right=True, shots=shots)
        page.click('[data-action=home]')
    print('ACTIVITÉS VUES:', sorted(kinds))
    for k in ['qcm', 'cloze-choice', 'qcm-rev', 'gate', 'cloze-type', 'order', 'match', 'felt']: assert k in kinds, (k, kinds)
    # défi d'étape : proposé quand les dix mots sont découverts depuis un jour au moins
    ch = page.locator('.deck').nth(N).locator('[data-action=challenge]'); assert ch.count() == 1, 'défi attendu'
    page.screenshot(path=f'{out}/home_challenge.png', full_page=True)
    ch.click(); kc = play(page, right=True, shots=shots); print('DÉFI:', sorted(kc))
    assert {'match', 'bank', 'order'} <= kc, kc
    assert 'relevé' in page.inner_text('.done'); page.screenshot(path=f'{out}/challenge_done.png', full_page=True)
    page.click('[data-action=home]')
    assert 'Défi de l’étape 1' not in page.locator('.deck').nth(N).inner_text()
    page.screenshot(path=f'{out}/home_after.png', full_page=True)
    print('PAQUET A2+:', page.locator('.deck').nth(N).inner_text().replace('\n', ' | ')[:300])

    # aperçu des exercices : tout se voit en deux minutes, sans rien enregistrer
    page.click('[data-action=teacher]')
    before = page.evaluate("JSON.stringify(window.__elefiches.state.progress)")
    page.locator('.decklist [data-action=tour]').first.click()
    kt = play(page, right=True, shots=shots, near=True); print('APERÇU A1:', sorted(kt))
    assert {'qcm', 'cloze-choice', 'qcm-rev', 'gate', 'cloze-type', 'order', 'situation-type', 'type', 'match', 'bank', 'accepted'} <= kt and 'felt' not in kt, kt
    assert 'tous les exercices' in page.inner_text('.done'); page.screenshot(path=f'{out}/tour_done.png')
    assert page.evaluate("JSON.stringify(window.__elefiches.state.progress)") == before, 'l’aperçu ne doit rien enregistrer'
    page.click('.done [data-action=teacher]')
    i_b1 = page.evaluate("window.__elefiches.state.decks.findIndex(d => d.name === 'Logement (B1)')")
    page.locator('.decklist [data-action=tour]').nth(i_b1).click()
    kb = play(page, right=True, near=True); assert 'second-try' in kb, kb
    page.click('.done [data-action=home]')
    # « Coup de chance » : la bonne réponse n'est pas comptée, le mot revient
    page.locator('.deck').nth(i_b1).locator('[data-action=start]').click()
    for _ in range(3): page.click('[data-action=next]')
    assert page.evaluate("window.__elefiches.step.activity.options.length") == 4, 'B1 : quatre options'
    ans = page.evaluate("window.__elefiches.step.activity.answer"); cid = page.evaluate("window.__elefiches.step.card.id")
    page.locator('.option', has_text=ans).click(); page.screenshot(path=f'{out}/felt.png', full_page=True)
    assert page.locator('[data-action=felt]').count() == 3
    page.click('[data-action=felt][data-v=lucky]')
    st = page.evaluate(f"(s => [s.session.progress['{cid}'].box, !!s.session.progress['{cid}'].fsrs, s.session.queue.some(i => i.id === '{cid}' && i.retry)])(window.__elefiches.state)")
    assert st == [1, True, True], st
    page.click('[data-action=quit]')

    # règles du jeu et troupeau complet
    page.click('[data-action=rules]'); page.wait_for_selector('.agelist'); page.screenshot(path=f'{out}/rules.png', full_page=True)
    page.click('[data-action=home]'); page.locator('.deck').nth(N).locator('[data-action=herd]').click(); page.wait_for_selector('.herdlist')
    page.screenshot(path=f'{out}/herd.png', full_page=True); page.click('[data-action=home]')
    # langue de l'interface
    page.click('details.settings summary'); page.click('[data-action=set][data-key=lang][data-value=en]')
    assert 'my herd' in page.inner_text('body').lower()
    # règle de niveau : en mode Auto, un paquet B2 d'anglais donne des consignes en anglais, un paquet A2 en français
    page.click('[data-action=set][data-key=lang][data-value=auto]')
    page.click('[data-action=teacher]'); page.click('details.card.more > summary'); page.locator('[data-action=try][data-model=en]').click(); page.wait_for_selector('.deck')
    n = page.locator('.deck').count()
    page.locator('.deck').nth(n - 1).locator('[data-action=start]').click(); page.wait_for_selector('.intro')
    assert 'nouveau mot' in page.inner_text('.intro').lower(), 'B1 : français attendu'
    page.click('[data-action=quit]'); page.click('[data-action=teacher]')
    page.locator('.decklist [data-action=edit]').nth(n - 1).click(); page.select_option('form[data-submit=rename] select[name=level]', 'B2')
    page.click('form[data-submit=rename] button.primary'); page.click('[data-action=teacher]'); page.click('[data-action=home]')
    page.locator('.deck').nth(n - 1).locator('[data-action=start]').click(); page.wait_for_selector('.study')
    assert page.evaluate("document.documentElement.lang") == 'en', 'B2 : anglais attendu'
    page.screenshot(path=f'{out}/b2_en.png')
    page.click('[data-action=quit]')
    assert page.evaluate("document.documentElement.lang") == 'fr'
    # ---- version 10 : contrôle du paquet, course, match amical, rappel, sauvegarde et restauration ----
    page.wait_for_selector('.deck')
    did = page.evaluate("window.__elefiches.state.decks.find(d => d.name === 'A2+ test').id")
    card = page.locator(f'.deck:has([data-action=herd][data-id="{did}"])')
    # la progression survit au rechargement de la page : c'est la condition de toute la méthode
    before = page.evaluate(f"JSON.stringify(Object.entries(window.__elefiches.state.progress['{did}']).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.box, v.fsrs.due]).sort())")
    page.reload(); page.wait_for_selector('.deck')
    after = page.evaluate(f"JSON.stringify(Object.entries(window.__elefiches.state.progress['{did}']).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.box, v.fsrs.due]).sort())")
    assert before == after and len(before) > 500, 'la progression doit être retrouvée à l’identique après rechargement'
    # course avec la souris : cinq bonnes réponses, une erreur, puis la fin du temps
    card.locator('[data-action=race]').click(); page.wait_for_selector('.track .hare svg'); page.screenshot(path=f'{out}/race.png')
    for k in range(6):
        a_ = page.evaluate("(a => [a.options, a.answer])(window.__elefiches.state.race.activity)")
        i = a_[0].index(a_[1]); page.locator('[data-action=race-pick]').nth(i if k != 2 else (i + 1) % len(a_[0])).click()
        if k == 2: page.wait_for_timeout(1000)
    assert page.evaluate("[window.__elefiches.state.race.score, window.__elefiches.state.race.miss]") == [5, 1]
    page.evaluate("window.__elefiches.state.race.startAt -= 61000"); page.wait_for_selector('.done'); page.screenshot(path=f'{out}/race_done.png')
    assert page.evaluate(f"window.__elefiches.state.progress['{did}']._race.best") == 5
    page.click('[data-action=home]'); assert 'record 5' in card.locator('[data-action=race]').inner_text()
    # match amical contre les crocodiles : ouvert quand toutes les défenses sont gagnées
    assert card.locator('.chlock .croc').count() == 1 and not card.locator('[data-action=friendly]').count()
    page.evaluate(f"(S => {{ const P = S.progress['{did}']; P._stages = {{}}; for (let i = 1; i <= 9; i++) P._stages[i] = Date.now(); window.__elefiches.rerender(); }})(window.__elefiches.state)")
    card.locator('[data-action=friendly]').click(); kf = play(page, right=True); page.screenshot(path=f'{out}/friendly_done.png', full_page=True)
    assert page.locator('.done .duo .croc').count() == 1 and 'Éléphants' in page.inner_text('.done'), page.inner_text('.done')
    page.click('.done [data-action=home]')
    # rappel : un fichier d'agenda
    page.click('details.remind summary'); page.fill('input[data-remind=time]', '07:45'); page.keyboard.press('Tab')
    with page.expect_download() as dl: page.click('[data-action=remind]')
    ics = open(dl.value.path(), encoding='utf-8').read(); assert dl.value.suggested_filename.endswith('.ics') and 'T074500' in ics and 'BEGIN:VALARM' in ics, ics[:300]
    page.screenshot(path=f'{out}/home_v10.png', full_page=True)
    # sauvegarde dans un fichier, puis restauration sur un appareil neuf
    if not page.locator('details.backup[open]').count(): page.click('details.backup summary')
    with page.expect_download() as dl: page.click('[data-action=backup]')
    bpath = out + '/_sauvegarde.json'; dl.value.save_as(bpath)
    fresh = b.new_context(viewport={'width': 420, 'height': 860}).new_page(); fresh.on('pageerror', lambda e: errors.append(str(e)))
    fresh.goto(student); fresh.wait_for_selector('.deck'); assert fresh.locator('.deck').count() == 1
    fresh.set_input_files('input[data-file=backup]', bpath); fresh.wait_for_selector('.bkask')       # la restauration demande une confirmation
    assert fresh.locator('.bkask li').count() >= 2 and 'nouveau paquet' in fresh.inner_text('.bkask'); fresh.screenshot(path=f'{out}/backup_ask.png', full_page=True)
    fresh.click('[data-action=backup-yes]'); fresh.wait_for_selector('.banner.good')
    got = fresh.evaluate(f"(S => [S.decks.length, JSON.stringify(Object.entries(S.progress['{did}']).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.box, v.fsrs.due]).sort()), S.progress['{did}']._race.best])(window.__elefiches.state)")
    assert got[1] == after and got[2] == 5 and got[0] >= 2, 'la restauration doit rendre les paquets et toute la progression'
    fresh.reload(); fresh.wait_for_selector('.deck'); assert fresh.evaluate(f"Object.keys(window.__elefiches.state.progress['{did}']).length") > 50, 'la progression restaurée est enregistrée'
    fresh.set_input_files('input[data-file=backup]', zpath); fresh.wait_for_selector('.banner.warn')
    import json as _json
    bad = _json.load(open(bpath, encoding='utf-8')); P = bad['progress'][did]
    P['_race'] = {'best': '<img src=x id=pwn1><meta http-equiv=refresh content="0;url=https://example.org/">', 'runs': 1}; P['_match'] = {'best': '<b id=pwn2>x</b>'}
    k0 = next(k for k in P if not k.startswith('_')); P[k0]['box'] = 99; P[k0]['fsrs']['last_review'] = 4102444800000; P[k0]['fsrs']['due'] = 4102444800000
    badpath = out + '/_sauvegarde_forgee.json'; _json.dump(bad, open(badpath, 'w', encoding='utf-8'))
    fresh.set_input_files('input[data-file=backup]', badpath); fresh.wait_for_selector('.bkask'); fresh.click('[data-action=backup-yes]'); fresh.wait_for_selector('.banner.good')
    fresh.reload(); fresh.wait_for_selector('.deck'); fresh.wait_for_timeout(1500)
    assert 'localhost' in fresh.url and not fresh.locator('#pwn1, #pwn2, meta[http-equiv=refresh]').count(), 'une sauvegarde forgée ne doit rien injecter'
    assert fresh.evaluate(f"(P => [P._race.best, P['{k0}'].box <= 5, P['{k0}'].fsrs.due < Date.now() + 6 * 365 * 86400000])(window.__elefiches.state.progress['{did}'])") == [5, True, True]
    # confidentialité : la page dit ce qui est enregistré, et « tout effacer » vide vraiment l'appareil
    fresh.click('[data-action=privacy]'); fresh.wait_for_selector('.privacy dl'); assert 'GitHub' in fresh.inner_text('.privacy') and 'cookie' in fresh.inner_text('.privacy').lower()
    fresh.click('[data-action=wipe]'); fresh.click('[data-action=wipe-yes]'); fresh.wait_for_timeout(300)
    assert fresh.locator('.privacy').count(), 'un double-clic ne doit pas tout effacer'
    fresh.wait_for_timeout(900); fresh.click('[data-action=wipe-yes]'); fresh.wait_for_selector('.deck')
    assert fresh.evaluate("(S => [S.decks.length, S.decks[0].demo === true, Object.keys(S.progress[S.decks[0].id] || {}).length])(window.__elefiches.state)") == [1, True, 0], 'après effacement : seulement la démonstration, sans progression'
    fresh.reload(); fresh.wait_for_selector('.deck'); assert fresh.locator('.deck').count() == 1
    fresh.close()
    # espace enseignant : contrôle automatique du paquet et prompt de correction
    page.click('[data-action=teacher]'); assert page.locator('.decklist .audit').count() >= 1
    page.screenshot(path=f'{out}/teacher_v10.png', full_page=True); page.click('[data-action=home]')

    # paquet reçu : par un lien (« ?paquet=… ») ou par un fichier ouvert depuis l'accueil, sur un appareil neuf
    import os
    pk = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'paquets'); os.makedirs(pk, exist_ok=True)
    with open(os.path.join(pk, '_test.json'), 'w', encoding='utf-8') as f: f.write(PACKET)
    try:
        ctx = b.new_context(viewport={'width': 420, 'height': 860}); p2 = ctx.new_page()
        p2.on('pageerror', lambda e: errors.append(str(e)))
        p2.goto(student + '?paquet=_test'); p2.wait_for_selector('.deck')
        assert not p2.locator('[data-action=teacher]').count(), 'interface étudiant : aucun accès à l’éditeur'
        p3 = b.new_context().new_page(); p3.goto(url.split('#')[0]); p3.wait_for_selector('[data-b=level]')   # enseignant.html s'ouvre sur l'éditeur
        assert 'index.html' not in p3.inner_text('.studenturl') and p3.inner_text('.studenturl').strip().endswith('/'); p3.close()
        assert p2.locator('.deck').count() == 1 and 'Logement (B1)' in p2.inner_text('.deck') and 'est prêt' in p2.inner_text('.banner.good'), p2.inner_text('body')[:300]
        # le lien reste dans l'adresse : une icône posée sur l'écran d'accueil rouvre ainsi le paquet, sans doublon ni perte
        assert '?paquet=_test' in p2.url
        p2.locator('[data-action=start]').first.click(); p2.wait_for_selector('.intro'); p2.click('[data-action=next]'); p2.click('[data-action=quit]')
        seen = p2.evaluate("(S => Object.keys(S.progress[S.decks[0].id]).length)(window.__elefiches.state)"); assert seen >= 1
        p2.reload(); p2.wait_for_selector('.deck')
        assert p2.locator('.deck').count() == 1 and p2.evaluate("(S => Object.keys(S.progress[S.decks[0].id]).length)(window.__elefiches.state)") == seen, 'rouvrir le lien garde la progression'
        p2.screenshot(path=f'{out}/student_link.png', full_page=True)
        p2.set_input_files('input[data-file=packet]', zpath); p2.locator('.deck').nth(1).wait_for()
        assert p2.locator('.deck').nth(1).locator('.prairie').count() == 1
        p2.goto(student + '?paquet=absent'); p2.wait_for_selector('.banner.warn'); assert 'lien' in p2.inner_text('.banner.warn')
        ctx.close()
    finally:
        os.remove(os.path.join(pk, '_test.json'))
    b.close()

print('ERREURS CONSOLE:', errors or 'aucune')
assert not errors
print('test navigateur réussi')
