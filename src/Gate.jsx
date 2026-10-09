// Wraps pages that need a signed-in account with a ready wallet.
export default function Gate({ acct, title, children }) {
  if (!acct.authenticated) {
    return (
      <section className="col">
        <div className="card">
          <h1 className="title">{title}</h1>
          <p className="sub">Sign in to continue. Email, Google, X or a wallet you already have.</p>
          <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>
        </div>
      </section>
    );
  }
  if (!acct.address) {
    return <section className="col"><p className="note">Setting up your account…</p></section>;
  }
  return children;
}
