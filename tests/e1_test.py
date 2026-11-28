# Parcours du sous-lot E1 : python3 tests/e1_test.py <url de index.html> <dossier de captures>
# Joue le VRAI fichier js/deck.js (démonstration à six jours conseillés), contrairement aux trois parcours historiques.
#   1. Démonstration déjà installée sur un appareil (sans jours, avec de la progression) : elle reçoit ses six jours au rechargement.
#   2. Positionnement, puis « Ton plan » ; « Recommencer à zéro » y est visible.
#   3. Retour après une erreur : trois blocs, « Continuer » retenu trois secondes, mot redemandé quelques mots plus tard.
#   4. Volets de l'accueil : « Rappels » reste ouvert quand on change les jours ; « Durée d'une séance » réservée aux listes sans plan.
#   5. Règles du jeu : textes exacts, écart sous le titre.
#   6. Lettre fautive visible après une réponse écrite à une lettre près (aperçu des exercices, espace enseignant).
import sys, time
from playwright.sync_api import sync_playwright, Page as _P, Locator as _L
def _plain(f): return lambda self, *a, **k: (lambda r: r.replace(' ', ' ') if isinstance(r, str) else r)(f(self, *a, **k))
for _c in (_P, _L):
    for _n in ('inner_text', 'text_content'): setattr(_c, _n, _plain(getattr(_c, _n)))

url, out = sys.argv[1], sys.argv[2]
teacher = url.split('index.html')[0] + 'enseignant.html'
errors = []
S = "window.__elefiches.state"

def old_deck(route):      # js/deck.js d'avant E1 : démonstration sans jours conseillés
    r = route.fetch(); body = r.text(); assert 'export const DEMO_DAYS = 6;' in body
    route.fulfill(response=r, body=body.replace('export const DEMO_DAYS = 6;', 'export const DEMO_DAYS = undefined;'), headers={**r.headers, 'cache-control': 'no-store'})      # jamais gardé en cache : le rechargement doit lire le vrai fichier

def to_question(page):      # passe les écrans de découverte jusqu'à la première question
    for _ in range(12):
        if page.evaluate("!!window.__elefiches.step?.activity"): return
        page.click('[data-action=next]'); page.wait_for_timeout(60)
    raise AssertionError('aucune question')

def gap_under_title(page):
    return page.evaluate("""() => { const h = document.querySelector('#app > h1'); let n = h.nextElementSibling; while (n && !n.getBoundingClientRect().height) n = n.nextElementSibling;
      return Math.round(n.getBoundingClientRect().top - h.getBoundingClientRect().bottom); }""")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

    # ---- 1. Un appareil qui a déjà la démonstration d'avant E1, avec un mot découvert.
    page.route('**/js/deck.js', old_deck)
    page.goto(url); page.wait_for_selector('.deck')
    assert page.evaluate(f"{S}.decks.length === 1 && {S}.decks[0].demo === true && {S}.decks[0].days === undefined")
    assert '5 min' in page.inner_text('.deck [data-action=start]') and not page.locator('.pathbtn, [data-action=place]').count(), 'avant E1 : libre-service, ni plan ni positionnement'
    page.click('details[data-k=set] > summary')
    assert page.locator('[data-key=minutes]').count() == 4 and 'Durée d’une séance' in page.inner_text('details[data-k=set]'), 'liste sans plan : la durée d’une séance se règle, et le mot est « séance »'
    assert not page.locator('.resetrow').count(), 'rien de commencé : rien à recommencer'
    page.click('.deck [data-action=start]'); page.wait_for_selector('.intro, .study'); to_question(page)
    first = page.evaluate("window.__elefiches.step.card.id")
    ans = page.evaluate("window.__elefiches.step.activity.answer"); texts = page.evaluate("window.__elefiches.step.activity.options")
    page.locator('.option').nth(texts.index(ans)).click(); page.wait_for_selector('.feedback')
    page.click('[data-action=quit]'); page.wait_for_selector('.deck')
    page.click('details[data-k=set] > summary')
    assert page.locator('.resetrow [data-action=reset]').count() == 1 and 'Au café' in page.inner_text('.resetrow'), 'liste sans plan commencée : « Recommencer » est visible dans les réglages'
    seen = page.evaluate(f"Object.keys({S}.progress[{S}.decks[0].id]).filter(k => !k.startsWith('_')).length"); assert seen >= 1
    page.unroute('**/js/deck.js')
    page.reload(); page.wait_for_selector('.deck')
    assert page.evaluate(f"{S}.decks.length === 1 && {S}.decks[0].demo === true && {S}.decks[0].days === 6"), 'démonstration déjà installée : six jours conseillés au rechargement'
    assert page.evaluate(f"Object.keys({S}.progress[{S}.decks[0].id]).filter(k => !k.startsWith('_')).length") == seen, 'la progression est gardée'
    assert page.locator('.deck [data-action=place]').count() == 1 and not page.locator('.deck [data-action=start]').count(), 'la carte propose de commencer par le positionnement'
    page.click('details[data-k=set] > summary')
    assert not page.locator('[data-key=minutes]').count(), 'toutes les listes ont un plan : plus de durée à régler'
    assert not page.locator('.resetrow').count(), 'liste à plan : « Recommencer » est dans « Ton plan »'
    page.reload(); page.wait_for_selector('.deck')
    assert page.evaluate(f"{S}.decks[0].days === 6"), 'les six jours sont enregistrés'
    page.screenshot(path=f'{out}/e1_accueil.png', full_page=True)

    # ---- 2. Positionnement, puis « Ton plan ».
    page.click('.deck [data-action=place]'); page.wait_for_selector('.placelist')
    total = page.evaluate(f"{S}.decks[0].cards.length")
    assert page.locator('.placelist .pick').count() == total - seen, 'positionnement : seulement les mots pas encore découverts'
    assert gap_under_title(page) >= 6
    assert page.inner_text('.placego .primary').strip() == 'Aucun'
    page.locator('.placelist .pick').nth(0).click(); assert [x.replace('\u00a0', ' ').strip() for x in page.locator('.placego button').all_inner_texts()] == ['Écrire ce mot', 'Passer']
    page.locator('.placelist .pick').nth(1).click(); page.locator('.placelist .pick').nth(2).click(); assert [x.replace('\u00a0', ' ').strip() for x in page.locator('.placego button').all_inner_texts()] == ['Écrire ces 3 mots', 'Passer']
    page.screenshot(path=f'{out}/e1_positionnement_3.png', full_page=True)
    for i in range(3): page.locator('.placelist .pick').nth(i).click()
    assert page.inner_text('.placego .primary').strip() == 'Aucun'
    page.screenshot(path=f'{out}/e1_positionnement.png', full_page=True)
    page.click('[data-action=place-skip]'); page.wait_for_selector('.paces')
    assert 'Ton plan' in page.inner_text('h1')
    assert page.locator('.ownlink [data-action=reset]').count() == 1 and page.inner_text('.ownlink [data-action=reset]').strip() == 'Recommencer à zéro'
    page.screenshot(path=f'{out}/e1_plan.png', full_page=True)
    # « Recommencer à zéro » : deux touchers, puis retour à l'accueil, liste remise à neuf.
    page.click('.ownlink [data-action=reset]'); page.wait_for_selector('[data-action=reset-yes]'); page.wait_for_timeout(900)
    page.click('[data-action=reset-yes]'); page.wait_for_selector('.deck')
    assert page.evaluate(f"Object.keys({S}.progress[{S}.decks[0].id]).length") == 0 and page.locator('.deck [data-action=place]').count() == 1
    page.click('.deck [data-action=place]'); page.wait_for_selector('.placelist'); assert page.locator('.placelist .pick').count() == total
    page.click('[data-action=place-skip]'); page.wait_for_selector('.paces')
    assert not page.locator('.ownlink [data-action=reset]').count(), 'rien de commencé : pas de lien inutile'
    page.click('[data-action=pace][data-pace=mid]'); page.wait_for_selector('.intro, .study')      # le premier choix du pas lance la séance

    # ---- 3. Retour après une erreur.
    to_question(page); page.wait_for_selector('.study .option')
    card = page.evaluate("window.__elefiches.step.card.id"); word = page.evaluate("window.__elefiches.step.card.word")
    ans = page.evaluate("window.__elefiches.step.activity.answer"); texts = page.evaluate("window.__elefiches.step.activity.options")
    t0 = time.time(); page.locator('.option').nth((texts.index(ans) + 1) % len(texts)).click(); page.wait_for_selector('.feedback.miss')
    kids = page.evaluate("[...document.querySelector('.feedback.miss').children].map(e => e.tagName.toLowerCase() + '.' + e.className.split(' ')[0])")
    assert kids == ['div.verdict', 'div.fiche', 'button.primary'], ('le verdict, la fiche complète, « Continuer »', kids)
    assert page.inner_text('.feedback h3').strip() == 'Pas encore.' and page.inner_text('.feedback .todo').strip() == 'Regarde bien cette fiche.'
    assert word in page.inner_text('.fiche .recap') and page.locator('.fiche .recap [data-action=speak]').count() == 1 and page.locator('.fiche .recap img').count() == 1, 'le mot, avec sa voix et son image'
    meaning = page.evaluate("(c => c.definition)(window.__elefiches.step.card)"); assert meaning and meaning in page.inner_text('.fiche .fichedef'), 'le sens du mot, mis en avant'
    assert page.locator('.fiche .example').count() == 1 and page.locator('.fiche .example b.target').count() >= 1, 'un ou deux exemples, le mot en gras : jamais un mot sans exemple'
    assert float(page.evaluate("getComputedStyle(document.querySelector('.fiche .fichedef')).fontWeight")) >= 600
    assert not page.locator('.feedback .oopsrow, .feedback .mascot').count(), 'ni phrase d’humour, ni second éléphanteau'
    btn = page.locator('.feedback [data-action=next]')
    assert btn.get_attribute('aria-disabled') == 'true' and 'hold' in btn.get_attribute('class')
    w = btn.bounding_box()['width']; assert w > 300, ('« Continuer » en pleine largeur', w)
    assert page.evaluate("getComputedStyle(document.querySelector('.feedback .hold')).opacity") == '1', 'en attente, le bouton reste lisible (pas d’opacité)'
    assert page.evaluate("getComputedStyle(document.querySelector('.feedback.miss .explain') || document.body).paddingLeft") == '0px', 'l’explication du verdict part du bord intérieur de l’encart'
    # Playwright attend de lui-même qu'un bouton « aria-disabled » redevienne actif : le toucher précoce est donc envoyé directement.
    btn.dispatch_event('click'); btn.focus(); page.keyboard.press('Enter'); page.wait_for_timeout(150)
    assert page.locator('.feedback.miss').count() == 1 and page.evaluate("window.__elefiches.step.card.id") == card, 'avant trois secondes, « Continuer » ne répond pas : la bonne réponse reste à l’écran'
    page.screenshot(path=f'{out}/e1_erreur_attente.png', full_page=True)
    page.wait_for_selector('.feedback [data-action=next]:not([aria-disabled])', timeout=6000); waited = time.time() - t0
    assert 1.7 <= waited <= 3.5, ('« Continuer » actif après deux secondes', waited)
    page.wait_for_timeout(2500); assert page.locator('.feedback.miss').count() == 1, 'la bonne réponse reste jusqu’au toucher'
    page.screenshot(path=f'{out}/e1_erreur_pret.png', full_page=True)
    assert page.evaluate(f"{S}.session.queue.findIndex(i => i.id === '{card}' && i.retry)") in (1, 2, 3, 4, 5), 'le mot est redemandé quelques mots plus tard (cinq au plus)'
    assert page.evaluate(f"(i => i.gate === true && i.help === undefined)({S}.session.queue.find(i => i.id === '{card}' && i.retry))"), 'de tête, sans aide ajoutée'
    btn.click(); assert page.evaluate(f"{S}.measure.e.length") == 1 and page.evaluate(f"{S}.measure.e[0]") >= 2, 'le temps passé sur la fiche est mesuré sur l’appareil'
    page.wait_for_function(f"window.__elefiches.step.card.id !== '{card}' || !{S}.feedback")
    assert not page.locator('.feedback').count(), 'la bonne réponse est masquée'
    back = None
    for k in range(10):      # le mot revient, sous la même forme, sans que sa réponse soit à l'écran
        to_question(page)
        if page.evaluate("window.__elefiches.step.card.id") == card and page.evaluate("!!window.__elefiches.step.item.retry"): back = k; break
        a2 = page.evaluate("window.__elefiches.step.activity.answer"); t2 = page.evaluate("window.__elefiches.step.activity.options")
        if page.locator('[data-action=reveal]').count(): page.click('[data-action=reveal]')
        page.locator('.option').nth(t2.index(a2)).click(); page.wait_for_selector('.feedback')
        if page.locator('[data-action=felt]').count(): page.click('[data-action=felt][data-v=easy]'); page.wait_for_timeout(60)
        if page.locator('.feedback [data-action=next]').count(): page.click('.feedback [data-action=next]')      # un mot apprivoisé garde son retour jusqu'au toucher
    assert back is not None and back >= 1, ('le mot raté revient après au moins un autre mot', back)
    page.click('[data-action=quit]'); page.wait_for_selector('.deck')

    # ---- 4. Volets de l'accueil.
    page.click('details[data-k=rem] > summary'); page.wait_for_selector('details[data-k=rem][open] #remtime')
    assert page.inner_text('details[data-k=rem] [data-action=remind]').strip() == 'Ajouter à mon agenda' and page.locator('details[data-k=rem] [data-action=remind]').bounding_box()['height'] <= 52, 'bouton du rappel sur une ligne'
    assert page.evaluate("(c => c !== getComputedStyle(document.documentElement).getPropertyValue('--line').trim() && c)(getComputedStyle(document.querySelector('#remtime')).borderTopColor)") == 'rgb(133, 128, 143)', 'bord du champ à 3 de contraste au moins'
    days = page.locator('.days [data-action=rem-day]')
    assert days.all_inner_texts() == ['L', 'M', 'M', 'J', 'V', 'S', 'D'] and page.get_attribute('.days [data-v=WE]', 'aria-label') == 'Mercredi'
    assert page.locator('.days [aria-pressed=true]').count() == 7 and 'Conseillé avec ton plan : chaque jour.' in page.inner_text('details[data-k=rem]'), 'avec un plan, tous les jours sont pré-cochés'
    box = [days.nth(i).bounding_box() for i in range(7)]; assert max(b['y'] for b in box) - min(b['y'] for b in box) < 1 and min(b['height'] for b in box) >= 44 and min(b['width'] for b in box) >= 32, ('sept pastilles sur une ligne', box[0])
    page.fill('#remtime', '07:45'); page.dispatch_event('#remtime', 'change')
    page.click('.days [data-v=SA]')
    assert page.locator('details[data-k=rem][open]').count() == 1, '« Rappels » reste ouvert quand on change les jours'
    assert page.get_attribute('.days [data-v=SA]', 'aria-pressed') == 'false' and page.locator('.days [aria-pressed=true]').count() == 6 and page.input_value('#remtime') == '07:45', 'le jour est décoché, l’heure est gardée'
    assert page.evaluate("document.activeElement?.dataset.v") == 'SA', 'la touche active reste sur le jour touché'
    page.click('.days [data-v=SU]'); assert page.locator('details[data-k=rem][open]').count() == 1 and page.locator('.days [aria-pressed=true]').count() == 5
    page.click('details[data-k=set] > summary'); page.click('[data-key=sound][data-value="0"]')
    assert page.locator('details[data-k=set][open]').count() == 1 and page.locator('details[data-k=rem][open]').count() == 1, 'deux volets ouverts le restent tous les deux'
    page.click('[data-key=sound][data-value="1"]')
    page.locator('details[data-k=rem]').scroll_into_view_if_needed(); page.screenshot(path=f'{out}/e1_rappels.png', full_page=True)
    page.reload(); page.wait_for_selector('.deck')
    assert page.evaluate(f"JSON.stringify({S}.remind.days) === '[\"MO\",\"TU\",\"WE\",\"TH\",\"FR\"]' && {S}.remind.time === '07:45'"), 'heure et jours du rappel sont enregistrés'
    page.click('details[data-k=rem] > summary'); assert page.locator('.days [aria-pressed=true]').count() == 5, 'les jours cochés sont retrouvés au rechargement'

    # ---- 5. Règles du jeu.
    page.click('[data-action=rules]'); page.wait_for_selector('.rulelist')
    rules = page.inner_text('#app')
    assert 'dix mots' not in rules and 'dizaine de mots' in rules and 'Quand tu les as tous découverts' in rules and 'La trompe avance à chaque réponse' in rules
    assert 'regarde bien la fiche' in rules and 'session' not in rules.lower()
    assert gap_under_title(page) == 16, ('le titre ne touche plus le premier encart', gap_under_title(page))
    gaps = page.evaluate("[...document.querySelectorAll('.card > h2')].map(h => Math.round(h.nextElementSibling.getBoundingClientRect().top - h.getBoundingClientRect().bottom))"); assert gaps and min(gaps) >= 8, ('dans un encart, le titre ne touche pas le texte', gaps)
    assert page.evaluate("[...document.querySelectorAll('.rulelist li')].every(li => Math.round(li.getBoundingClientRect().left) === Math.round(li.closest('.card').querySelector('h2').getBoundingClientRect().left))"), 'listes des règles : même bord que le titre de l’encart'
    page.screenshot(path=f'{out}/e1_regles.png', full_page=True)

    # ---- 6. Lettre fautive visible (aperçu des exercices, espace enseignant de la copie de test).
    t = ctx.new_page(); t.on('pageerror', lambda e: errors.append(str(e))); t.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    t.goto(teacher); t.wait_for_selector('.decklist [data-action=tour]'); t.locator('.decklist [data-action=tour]').first.click(); t.wait_for_selector('.study')
    t.evaluate(f"{S}.session.queue = {S}.session.queue.filter(i => i.force === 'type')")      # l'aperçu va droit à la question « écris le mot »
    a1 = t.evaluate("window.__elefiches.step.activity.answer"); o1 = t.evaluate("window.__elefiches.step.activity.options")
    t.locator('.option').nth(o1.index(a1)).click(); t.wait_for_selector('.feedback'); t.click('.feedback [data-action=next]'); t.wait_for_selector('input[name=answer]')
    assert t.evaluate("window.__elefiches.step.activity.type") == 'type'
    a = t.evaluate("window.__elefiches.step.activity.answer"); assert len(a) >= 5, a
    bad = a[:-1] + ('z' if a[-1] != 'z' else 'y')
    t.fill('input[name=answer]', bad); t.press('input[name=answer]', 'Enter'); t.wait_for_selector('p.again')
    t.fill('input[name=answer]', bad); t.press('input[name=answer]', 'Enter'); t.wait_for_selector('.feedback.miss')
    assert t.locator('.feedback.miss .spelling mark').count() == 1 and t.inner_text('.feedback.miss .spelling mark').strip().lower() == a[-1].lower(), 'la lettre qui diffère reste visible dans la bonne orthographe'
    assert t.input_value('input[name=answer]') == bad, 'et la réponse de l’étudiant reste au-dessus'
    assert t.locator('.feedback.miss .recap b').count() == 1 and not t.locator('.feedback.miss .verdict .spelling').count(), 'le mot n’est écrit qu’une fois'
    t.locator('.feedback.miss').scroll_into_view_if_needed(); t.screenshot(path=f'{out}/e1_lettre.png', full_page=True); done = True
    assert done, 'une question écrite a été jouée dans l’aperçu'
    b.close()

print('ERREURS CONSOLE:', errors or 'aucune')
assert not errors
print('test du sous-lot E1 réussi')
