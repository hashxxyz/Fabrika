export default function Setup() {
  return (
    <main className="wrap setup">
      <h1>One step left</h1>
      <p className="lede">Fabrika needs your Privy app ID before it can show the sign in screen.</p>
      <ol className="setup-list">
        <li>Create an app at dashboard.privy.io.</li>
        <li>In Settings, turn on Email, Google and Wallet login. Add your site domain under Allowed origins.</li>
        <li>Copy the App ID. Set it as <code>VITE_PRIVY_APP_ID</code> in <code>.env</code> or in your Vercel project settings.</li>
        <li>Redeploy.</li>
      </ol>
    </main>
  );
}
