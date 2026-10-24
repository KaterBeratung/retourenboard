// The disclosure works before JavaScript loads; enhancement only handles dismissal.
export function bindMobileMenu(page: Document, query: MediaQueryList): void {
 const menu = page.querySelector<HTMLDetailsElement>('.mobile-menu');
 if (!menu) return;
 const summary = menu.querySelector<HTMLElement>('summary');
 const close = () => { menu.open = false; };
 menu.addEventListener('click', event => {
  if ((event.target as Element).closest?.('a')) close();
 });
 page.addEventListener('click', event => {
  if (menu.open && !menu.contains(event.target as Node)) close();
 });
 page.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) { close(); summary?.focus(); }
 });
 query.addEventListener('change', close);
}
