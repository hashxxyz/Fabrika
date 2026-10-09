import { useEffect, useState } from 'react';

// Tiny history router: real URLs (/transfer, /account, ...) with no extra dependency.
// vercel.json already rewrites every non-api path to index.html.
const listeners = new Set();

export function navigate(to) {
  if (to === location.pathname + location.search) return;
  history.pushState({}, '', to);
  listeners.forEach((fn) => fn());
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    listeners.add(on);
    window.addEventListener('popstate', on);
    return () => { listeners.delete(on); window.removeEventListener('popstate', on); };
  }, []);
  return path.replace(/\/+$/, '') || '/';
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
