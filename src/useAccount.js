import { useCallback, useEffect, useRef, useState } from 'react';
import * as PrivySDK from '@privy-io/react-auth';

import { createWalletClient, custom, parseEther } from 'viem';
import { monadTestnet, publicClient } from './chain.js';

const { usePrivy, useWallets } = PrivySDK;
// Newer Privy versions have useExportWallet, older ones put exportWallet on usePrivy.
// Pick once when the module loads, so the hook is called the same way on every render.
const useExport = PrivySDK.useExportWallet || (() => null);
// Accounts below this get a starter balance. Matches the server's default WELCOME_AMOUNT.
const STARTER_BELOW = parseEther('0.1');

export default function useAccount() {
  const { ready, authenticated, login, logout, getAccessToken, user, linkTwitter, exportWallet: legacyExport } = usePrivy();
  const { wallets } = useWallets();
  const exporter = useExport();
  const wallet = wallets.find((w) => w.walletClientType === 'privy') || wallets[0];
  const address = wallet?.address;
  const [balance, setBalance] = useState(null);
  const [welcome, setWelcome] = useState('idle'); // idle | sending | done
  const [retry, setRetry] = useState(0);
  const tried = useRef(''); // address we already asked for a starter balance
  const attempts = useRef(0); // retries so far, capped
  const retryTimer = useRef(0);
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  const refresh = useCallback(async () => {
    if (!address) return;
    try { setBalance(await publicClient.getBalance({ address })); } catch { /* keep last value */ }
  }, [address]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
  }, [refresh]);

  // New account with nothing in it: ask the server for a one-time starter balance, so nobody needs a faucet.
  useEffect(() => {
    if (!authenticated || !address || balance === null || balance >= STARTER_BELOW || tried.current === address) return;
    const k = `fabrika.welcome.${address.toLowerCase()}`;
    try { if (localStorage.getItem(k)) return; } catch { /* ignore */ }
    tried.current = address;
    setWelcome('sending');
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/welcome', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ address }),
        });
        if (res.ok || res.status === 409) { try { localStorage.setItem(k, '1'); } catch { /* ignore */ } }
        if (res.ok) { setWelcome('done'); await refresh(); return; }
        setWelcome('idle');
        if (res.status === 409) return;
        // Other 4xx answers will not change by asking again. Only retry rate limits and server errors.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) return;
        throw new Error('retry');
      } catch {
        setWelcome('idle');
        if (++attempts.current > 4) return;
        retryTimer.current = setTimeout(() => { tried.current = ''; setRetry((n) => n + 1); }, 30000 * attempts.current);
      }
    })();
  }, [authenticated, address, balance, getAccessToken, refresh, retry]);

  const getClient = useCallback(async () => {
    if (!wallet) throw new Error('No wallet yet. Sign in first.');
    await wallet.switchChain(monadTestnet.id);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({ account: address, chain: monadTestnet, transport: custom(provider) });
  }, [wallet, address]);

  // Only wallets Privy created for the user can be exported. Privy opens its own secure window; this app never sees the key.
  const canExport = wallet?.walletClientType === 'privy';
  const exportWallet = exporter?.exportWallet || legacyExport;
  const exportKey = useCallback(() => exportWallet({ address }), [exportWallet, address]);

  const xName = user?.twitter?.username || '';
  const label = user?.email?.address || user?.google?.email || (xName ? `@${xName}` : '');
  return { welcome, ready, authenticated, login, logout, getAccessToken, wallet, address, balance, refresh, getClient, label, linkTwitter, xName, canExport, exportKey };
}
