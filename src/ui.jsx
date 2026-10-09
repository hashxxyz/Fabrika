export function Stitch() {
  return (
    <svg className="stitch" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
      <line className="base" x1="0" y1="4" x2="100" y2="4" />
      <line className="done" x1="0" y1="4" x2="100" y2="4" pathLength="100" />
    </svg>
  );
}

export function Badge({ children }) {
  return <span className="badge"><i />{children}</span>;
}

export function copyText(text, toast) {
  const done = () => toast && toast('Copied');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done);
  else done();
}
