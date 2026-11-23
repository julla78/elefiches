# Test de bout en bout : python3 tests/browser_test.py <url> <csv> <dossier de captures>
import sys, re
from playwright.sync_api import sync_playwright

url, csv, out = sys.argv[1], sys.argv[2], sys.argv[3]
from PIL import Image
png = out + '/_test.png'; Image.new('RGB', (1200, 800), (255, 122, 89)).save(png)
errors = []

def play(page, right=True, shots=None):
    """Joue une session entière. right=True répond juste quand c'est possible."""
    kinds = set()
    for _ in range(200):
        if page.locator('.done').count():
            return kinds
        if page.locator('.intro').count():
            kinds.add('intro'); page.click('[data-action=next]'); continue
        if page.locator('.feedback').count():
            if shots is not None and 'win' not in shots and page.locator('.win').count(): shots['win'] = True; page.screenshot(path=f'{out}/win.png', full_page=True)
            page.click('.feedback [data-action=next]'); continue
        if page.locator('.option').count():
            kinds.add('choice')
            # la bonne réponse est connue du test via l'état interne exposé par la page
            ans = page.evaluate("window.__elefiches.step.activity.answer")
            opts = page.locator('.option')
            texts = [re.sub(r'^\d\s*', '', opts.nth(i).inner_text()).strip() for i in range(opts.count())]
            assert ans in texts, (ans, texts)
            idx = texts.index(ans) if right else (texts.index(ans) + 1) % len(texts)
            if shots is not None and 'choice' not in shots: shots['choice'] = True; page.screenshot(path=f'{out}/choice.png')
            if shots is not None and 'cloze' not in shots and page.locator('.sentence').count(): shots['cloze'] = True; page.screenshot(path=f'{out}/cloze.png')
            opts.nth(idx).click()
        else:
            kinds.add('typed')
            acc = page.evaluate("window.__elefiches.step.activity.accepted[0]")
            if shots is not None and 'typed' not in shots: shots['typed'] = True; page.screenshot(path=f'{out}/typed.png')
            page.fill('input[name=answer]', acc if right else 'zzz')
            page.press('input[name=answer]', 'Enter')
        assert page.locator('.feedback').count() == 1
    raise AssertionError('session sans fin')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = b.new_page(viewport={'width': 420, 'height': 860})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_selector('.deck')
    page.screenshot(path=f'{out}/home.png', full_page=True)

    page.click('[data-action=start]')
    page.wait_for_selector('.intro'); page.screenshot(path=f'{out}/intro.png')
    shots = {}
    k1 = play(page, right=False, shots=shots)
    page.screenshot(path=f'{out}/done.png')
    assert 'intro' in k1 and 'choice' in k1, k1
    page.click('[data-action=home]')
    assert 'Commencer' in page.inner_text('body'), 'interface en français par défaut'

    # la progression survit à un rechargement
    page.reload(); page.wait_for_selector('.deck')
    assert page.locator('.deck').first.locator('.prairie .ele').count() == 3, 'trois éléphanteaux attendus après la première session'

    # espace enseignant : tutoriel, modèles, import du CSV réel
    page.click('[data-action=teacher]'); page.wait_for_selector('.models')
    page.screenshot(path=f'{out}/teacher.png', full_page=True)
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
    page.wait_for_function("!document.querySelector('[data-preview=image]').hidden")
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
    page.click('[data-action=teacher]')
    page.fill('form[data-submit=import] input[name=name]', 'A2+ test')
    page.set_input_files('input[name=file]', csv)
    page.click('.import button.primary')
    page.wait_for_selector('.banner.good')
    print('IMPORT:', page.locator('.banner.good').inner_text())
    assert page.locator('.deck').count() == 3
    page.locator('.deck').nth(2).locator('[data-action=start]').click()
    k2 = play(page, right=True, shots=shots)
    page.screenshot(path=f'{out}/done_win.png')
    assert 'apprivois' in page.inner_text('.done')
    page.click('[data-action=home]')

    # avance de l'horloge pour faire monter les fiches jusqu'aux activités écrites
    kinds = set()
    for day in range(1, 30):
        page.evaluate(f"(() => {{ const real = Date.now.bind(Date); const off = {day} * 86400000 * 2; if (!window.__realNow) window.__realNow = real; Date.now = () => window.__realNow() + off; }})()")
        page.evaluate("window.__elefiches.rerender()")
        btn = page.locator('.deck').nth(2).locator('[data-action=start]')
        if not btn.count(): continue
        btn.click()
        kinds |= play(page, right=True, shots=shots)
        page.click('[data-action=home]')
    print('ACTIVITÉS VUES:', sorted(kinds))
    assert 'typed' in kinds
    page.screenshot(path=f'{out}/home_after.png', full_page=True)
    print('PAQUET A2+:', page.locator('.deck').nth(2).inner_text().replace('\n', ' | ')[:300])

    # langue de l'interface
    page.click('details.settings summary'); page.click('[data-action=set][data-key=lang][data-value=en]')
    assert 'your herd' in page.inner_text('body').lower()
    # règle de niveau : en mode Auto, un paquet B2 d'anglais donne des consignes en anglais, un paquet A2 en français
    page.click('[data-action=set][data-key=lang][data-value=auto]')
    page.click('[data-action=teacher]'); page.locator('[data-action=try][data-model=en]').click(); page.wait_for_selector('.deck')
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
    b.close()

print('ERREURS CONSOLE:', errors or 'aucune')
assert not errors
print('test navigateur réussi')
