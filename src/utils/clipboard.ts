// Safe clipboard copy that works in secure contexts (https/localhost) AND
// falls back to a legacy method when navigator.clipboard is unavailable —
// e.g. when the app is opened over a plain-http LAN IP on a phone.
export async function copyToClipboard(text: string): Promise<boolean> {
  // Preferred: async Clipboard API (only available in secure contexts)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy method
  }

  // Fallback: hidden textarea + execCommand('copy')
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
