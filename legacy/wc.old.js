// Bundled at build time, so the site does not depend on a CDN for WalletConnect.
import { EthereumProvider } from '@walletconnect/ethereum-provider';
window.__WC = EthereumProvider;
