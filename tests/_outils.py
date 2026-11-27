# Outils communs aux parcours navigateur (browser_test.py, essai_test.py, plan_test.py).
#
# 1. Depuis le sous-lot E1, la démonstration « Au café » porte six jours conseillés : elle a donc un plan. Les trois parcours
#    historiques testent aussi une liste SANS jours conseillés (libre-service) et s'appuient pour cela sur la démonstration : pour
#    eux, le fichier js/deck.js est servi avec une démonstration sans jours. Le parcours e1_test.py, lui, joue le vrai fichier.
# 2. Après une erreur, « Continuer » ne répond qu'au bout de trois secondes. Les parcours historiques ne les attendent pas à
#    chaque erreur : l'attente est levée par l'état de test (disponible sur localhost seulement). e1_test.py vérifie l'attente réelle.
from playwright.sync_api import Browser, Page

def _deck(route):
    r = route.fetch(); body = r.text(); assert 'export const DEMO_DAYS = 6;' in body
    route.fulfill(response=r, body=body.replace('export const DEMO_DAYS = 6;', 'export const DEMO_DAYS = undefined;'))

for _name in ('new_page', 'new_context'):
    def _wrap(orig):
        def make(self, **kw):
            x = orig(self, **kw); x.route('**/js/deck.js', _deck); return x
        return make
    setattr(Browser, _name, _wrap(getattr(Browser, _name)))

_click = Page.click
def _next(self, selector, **kw):
    if 'data-action=next' in selector:
        try: self.evaluate("(() => { const f = window.__elefiches?.state?.feedback; if (f && f.holdUntil) f.holdUntil = 0; document.querySelector('.hold[aria-disabled]')?.removeAttribute('aria-disabled'); })()")
        except Exception: pass
    return _click(self, selector, **kw)
Page.click = _next
