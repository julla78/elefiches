# Parcours du lot « Exemples : ancrer puis varier » : python3 tests/ex_test.py <url de index.html> <dossier de captures>
#   1. Mot nouveau (boîte 1) raté : la fiche du retour montre la PREMIÈRE phrase de la fiche, et elle seule.
#   2. Mot déjà ancré (boîte 2 et plus) : le retour suit l'ordre de la rencontre, et montre d'abord une phrase qui n'est pas à l'écran.
#   3. Mot retombé en boîte 1 après une erreur : la première phrase revient.
#   4. Espace enseignant : de deux à cinq phrases, message au minimum, prompt accordé.
import sys, re
from playwright.sync_api import sync_playwright

url, out = sys.argv[1], sys.argv[2]
S = 'window.__elefiches.state'
flat = lambda x: re.sub(r'\s+', ' ', re.sub(r'[  ]', ' ', (x or '').replace('’', "'"))).strip()

def to_question(page):
    for _ in range(12):
        if page.evaluate("!!window.__elefiches.step?.activity"): return
        page.click('[data-action=next]'); page.wait_for_timeout(60)
    raise AssertionError('aucune question')

with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='fr-FR'); page = c.new_page()
    errs = []; page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(url); page.wait_for_selector('.deck')
    page.click('.deck [data-action=place]'); page.wait_for_selector('.placelist'); page.click('[data-action=place-skip]'); page.wait_for_selector('.paces')
    page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.intro, .study')

    # ---- 1. Mot nouveau raté : la phrase d'ancrage.
    to_question(page); page.wait_for_selector('.study .option')
    exs = [flat(x) for x in page.evaluate("window.__elefiches.step.card.examples")]; assert len(exs) >= 2, exs
    assert page.evaluate("window.__elefiches.step.activity.rank") == list(range(len(exs))), 'boîte 1 : les phrases dans l’ordre de la fiche'
    ans = page.evaluate("window.__elefiches.step.activity.answer"); texts = page.evaluate("window.__elefiches.step.activity.options")
    page.locator('.option').nth((texts.index(ans) + 1) % len(texts)).click(); page.wait_for_selector('.feedback.miss')
    shown = [flat(x) for x in page.locator('.fiche .example').all_inner_texts()]
    assert shown == [exs[0]], ('mot nouveau : la première phrase, et elle seule', shown, exs)
    assert page.locator('.fiche .example b.target').count() == 1, 'le mot est en gras dans la phrase d’ancrage'
    page.screenshot(path=f'{out}/ex-1-ancrage.png')

    # ---- 2. Mot déjà ancré : l'ordre de la rencontre, et d'abord une phrase qui n'est pas à l'écran.
    page.evaluate(f"(() => {{ const s = {S}; s.step.activity.rank = [1, 0]; s.feedback.boxBefore = 3; s.feedback.boxAfter = 2; window.__elefiches.rerender(); }})()")
    shown = [flat(x) for x in page.locator('.fiche .example').all_inner_texts()]
    assert shown == [exs[1]], ('mot ancré : la phrase du tour', shown, exs)
    page.screenshot(path=f'{out}/ex-2-variation.png')
    page.evaluate(f"(() => {{ const s = {S}; s.step.activity.cloze = {{ text: s.step.card.examples[1].replace(/[’`´]/g, \"'\"), spans: [], answer: '' }}; window.__elefiches.rerender(); }})()")
    shown = [flat(x) for x in page.locator('.fiche .example').all_inner_texts()]
    assert shown == [exs[0]], ('la phrase déjà à l’écran passe en dernier', shown, exs)

    # ---- 3. Mot retombé en boîte 1 : la phrase d'ancrage revient.
    page.evaluate(f"(() => {{ const s = {S}; delete s.step.activity.cloze; s.step.activity.rank = [1, 0]; s.feedback.boxBefore = 2; s.feedback.boxAfter = 1; window.__elefiches.rerender(); }})()")
    shown = [flat(x) for x in page.locator('.fiche .example').all_inner_texts()]
    assert shown == [exs[0]], ('mot retombé : retour à l’ancrage', shown, exs)

    # ---- 4. Espace enseignant : de deux à cinq phrases.
    page.goto(url.replace('index.html', 'enseignant.html')); page.wait_for_selector('select[data-b=examples]', state='attached')
    sel = page.locator('select[data-b=examples]'); warn = page.locator('[data-exwarn]')
    assert [flat(o) for o in sel.locator('option').all_inner_texts()] == ['2 phrases', '3 phrases', '4 phrases', '5 phrases'] and sel.input_value() == '4'
    page.select_option('select[data-b=level]', 'A2'); assert warn.is_hidden(), 'quatre phrases : aucun message'
    sel.select_option('2'); assert warn.is_visible() and 'trois ou plus' in flat(warn.inner_text()) and 'warn' not in (warn.get_attribute('class') or '')
    pr = flat(page.locator('pre[data-prompt=cards]').text_content()); assert 'EXACTEMENT DEUX phrases' in pr and "phrase d'ancrage" in pr and 'Ancrer, puis varier' in pr
    sel.select_option('5'); assert warn.is_hidden() and 'EXACTEMENT CINQ phrases' in flat(page.locator('pre[data-prompt=cards]').text_content())
    page.locator('section.card.import').first.screenshot(path=f'{out}/ex-4-reglage.png')

    print('ERREURS CONSOLE:', errs or 'aucune'); assert not errs
    b.close()
print('test du lot « Exemples » réussi')
