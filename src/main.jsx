import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App.jsx';
import Setup from './Setup.jsx';
import { PRIVY_APP_ID, monadTestnet } from './chain.js';
import './styles.css';

function currentTheme() {
  try {
    const t = localStorage.getItem('fabrika.theme');
    if (t === 'light' || t === 'dark') return t;
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const root = createRoot(document.getElementById('root'));

if (!PRIVY_APP_ID) {
  root.render(<Setup />);
} else {
  root.render(
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: {
          theme: currentTheme(),
          accentColor: '#2E7D53',
          logo: `${location.origin}/logo.svg`,
        },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
      }}
    >
      <App />
    </PrivyProvider>
  );
}
