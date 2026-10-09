// Wraps pages that need a signed-in account with a ready wallet.
export default function Gate({ acct, title, children }) {
  if (!acct.authenticated) {
    return (
      <section className="page">
        <div className="pane">
          <h2>{title}</h2>
          <p>Sign in to continue.</p>
          <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>
        </div>
      </section>
    );
  }
  if (!acct.address) {
    return <section className="page"><p className="note">Setting up your wallet…</p></section>;
  }
  return children;
}
