import 'server-only';

// Best-effort client IP from proxy headers (Cloudflare → Railway → Next).
export function clientIp(h: Headers): string {
  return (
    h.get('cf-connecting-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0] ||
    h.get('x-real-ip') ||
    ''
  ).trim();
}

// Compact, human-readable device label, e.g. "Chrome 149 (macOS)".
export function parseUserAgent(ua: string | null | undefined): string {
  const s = ua || '';
  const os =
    /Windows NT/.test(s) ? 'Windows'
    : /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Mac OS X|Macintosh/.test(s) ? 'macOS'
    : /Android/.test(s) ? 'Android'
    : /Linux/.test(s) ? 'Linux'
    : 'Unknown OS';
  let browser = 'Browser';
  let m: RegExpMatchArray | null;
  if ((m = s.match(/Edg\/(\d+)/))) browser = `Edge ${m[1]}`;
  else if ((m = s.match(/OPR\/(\d+)/))) browser = `Opera ${m[1]}`;
  else if ((m = s.match(/Chrome\/(\d+)/))) browser = `Chrome ${m[1]}`;
  else if ((m = s.match(/Firefox\/(\d+)/))) browser = `Firefox ${m[1]}`;
  else if ((m = s.match(/Version\/(\d+)[.\d]*\s+Safari/))) browser = `Safari ${m[1]}`;
  else if (/Safari/.test(s)) browser = 'Safari';
  return `${browser} (${os})`;
}

// Resolve city/country for an IP (free ipwho.is, 1.5s timeout, graceful
// fallback). Private/loopback IPs return the fallback country only.
export async function geoLookup(
  ip: string,
  fallbackCountry?: string | null,
): Promise<{ city: string | null; country: string | null }> {
  const priv = !ip || ip === '127.0.0.1' || ip === '::1' ||
    ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.');
  if (priv) return { city: null, country: fallbackCountry || null };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,country`, { signal: ctrl.signal });
    clearTimeout(t);
    const j = (await res.json()) as { success?: boolean; city?: string; country?: string };
    if (j?.success) return { city: j.city || null, country: j.country || fallbackCountry || null };
  } catch {
    /* fall through */
  }
  return { city: null, country: fallbackCountry || null };
}
