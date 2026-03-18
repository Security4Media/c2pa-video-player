function isCawgIdentityUntrustedFailure(result: { code?: string; url?: string }) {
  return result?.code === 'signingCredential.untrusted' && result?.url?.includes('cawg.identity');
}
