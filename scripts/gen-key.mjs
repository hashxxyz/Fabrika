// Prints a fresh private key and its address. Use one for AUTHORIZER_PRIVATE_KEY, and optionally another for RELAYER_PRIVATE_KEY.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const k = generatePrivateKey();
console.log('private key:', k);
console.log('address:    ', privateKeyToAccount(k).address);
