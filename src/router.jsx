import { useEffect, useState } from 'react';

// Tiny history router: real URLs (/transfer, /account, ...) with no extra dependency.
// vercel.json already rewrites every non-api path to index.html.
const listeners = new Set();

// Each in-app navigation stores how deep we are (idx) and the page we came from, so a Back arrow
// can return to the real previous page, or to a sensible parent when the page was opened directly.
export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  const idx = history.state?.idx ?? 0;
  if (replace) history.replaceState({ idx, from: history.state?.from || '' }, '', to);
  else history.pushState({ idx: idx + 1, from: location.pathname }, '', to);
  listeners.forEach((fn) => fn());
  window.scrollTo(0, 0);
}

// The page Back would return to, or '' when this page was opened directly.
export const previousPath = () => ((history.state?.idx ?? 0) > 0 ? history.state?.from || '' : '');

export function goBack(fallback = '/') {
  if ((history.state?.idx ?? 0) > 0) history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute() {
  // Re-render on every navigation, including query-only changes like /save?s=... (the path itself stays the same).
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    listeners.add(on);
    window.addEventListener('popstate', on);
    return () => { listeners.delete(on); window.removeEventListener('popstate', on); };
  }, []);
  return location.pathname.replace(/\/+$/, '') || '/';
}

export function Link({ to, className, children, ...rest }) {
  const path = useRoute();
  const active = to === '/' ? path === '/' : path.startsWith(to);
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} className={className} onClick={onClick} aria-current={active ? 'page' : undefined} {...rest}>{children}</a>;
}
