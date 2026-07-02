import 'server-only';

export const RP_NAME = 'BANA Wallet';

// Derive the WebAuthn Relying Party ID (registrable domain) and the expected
// origin from the incoming request, honoring Railway's proxy headers. On
// localhost this yields rpID "localhost" / origin "http://localhost:3000"; on
// production, "banawallet.com" / "https://banawallet.com".
export function rpFromHeaders(h: Headers): { rpID: string; origin: string } {
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const rpID = host.split(':')[0]; // strip port → registrable domain
  return { rpID, origin: `${proto}://${host}` };
}

export function rpFromRequest(req: Request): { rpID: string; origin: string } {
  return rpFromHeaders(req.headers);
}
