import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import { monadTestnet, publicClient } from './chain.js';

export default function useAccount() {
  const { ready, authenticated, login, logout, getAccessToken, user, linkTwitter } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === 'privy') || wallets[0];
  const address = wallet?.address;
  const [balance, setBalance] = useState(null);
  const [welcome, setWelcome] = useState('idle'); // idle | sending | done
  const tried = useRef(''); // address we already asked for a starter balance

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
    if (!authenticated || !address || balance !== 0n || tried.current === address) return;
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
        if (res.ok) { setWelcome('done'); await refresh(); } else setWelcome('idle');
      } catch { setWelcome('idle'); }
    })();
  }, [authenticated, address, balance, getAccessToken, refresh]);

  const getClient = useCallback(async () => {
    if (!wallet) throw new Error('No wallet yet. Sign in first.');
    await wallet.switchChain(monadTestnet.id);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({ account: address, chain: monadTestnet, transport: custom(provider) });
  }, [wallet, address]);

  const xName = user?.twitter?.username || '';
  const label = user?.email?.address || user?.google?.email || (xName ? `@${xName}` : '');
  return { welcome, ready, authenticated, login, logout, getAccessToken, wallet, address, balance, refresh, getClient, label, linkTwitter, xName };
}
