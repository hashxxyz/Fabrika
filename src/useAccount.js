import { useCallback, useEffect, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import { monadTestnet, publicClient } from './chain.js';

export default function useAccount() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === 'privy') || wallets[0];
  const address = wallet?.address;
  const [balance, setBalance] = useState(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try { setBalance(await publicClient.getBalance({ address })); } catch { /* keep last value */ }
  }, [address]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
  }, [refresh]);

  const getClient = useCallback(async () => {
    if (!wallet) throw new Error('No wallet yet. Sign in first.');
    await wallet.switchChain(monadTestnet.id);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({ account: address, chain: monadTestnet, transport: custom(provider) });
  }, [wallet, address]);

  const label = user?.email?.address || user?.google?.email || '';
  return { ready, authenticated, login, logout, getAccessToken, wallet, address, balance, refresh, getClient, label };
}
