/** Clipboard API needs https; fall back to the old execCommand trick on plain http. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * Native share sheet on phones, clipboard elsewhere.
 * Returns 'shared', 'copied', 'cancelled' or 'failed'.
 */
export async function shareOrCopy(data: { text: string; url?: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Goli', ...data });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(data.url ? `${data.text} ${data.url}` : data.text)) ? 'copied' : 'failed';
}
