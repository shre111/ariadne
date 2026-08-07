// Copying a link has to work on every origin the app is served from.
//
// `navigator.clipboard` is exposed only in a *secure context* — HTTPS, or
// localhost. On a plain-HTTP deployment the whole API is `undefined`, so
// `navigator.clipboard?.writeText(...)` quietly yields undefined and calling
// `.then()` on it throws. The button then looks dead: nothing copied, no error.
//
// So: try the modern API, fall back to the legacy execCommand path (which has
// no secure-context requirement), and report failure honestly so the caller can
// show the link for manual copying instead of pretending it worked.
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or a non-focused document — try the fallback.
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Keep it off-screen but still selectable; `display:none` can't be selected.
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS Safari needs the explicit range
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
