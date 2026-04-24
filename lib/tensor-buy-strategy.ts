function isLocalTensorBuyHostname(hostname?: string | null): boolean {
  if (!hostname) {
    return false;
  }

  const normalizedHostname = hostname.trim().toLowerCase();
  return (
    normalizedHostname === 'localhost'
    || normalizedHostname.endsWith('.localhost')
    || normalizedHostname === '127.0.0.1'
    || normalizedHostname === '::1'
    || normalizedHostname === '[::1]'
  );
}

export function shouldUseTensorWalletSendTransaction(
  walletName?: string,
  hostname?: string | null,
): boolean {
  const isSolflare = walletName?.toLowerCase().includes('solflare') ?? false;
  return isSolflare && !isLocalTensorBuyHostname(hostname);
}