import { buildShareUrl, flowerBackendBaseUrl } from '@/integrations/flowerBackend/client';

/**
 * Share a flower link from a gallery card. Builds the backend /share/:id URL and
 * uses the Web Share sheet when available, else copies to the clipboard. Best
 * effort — swallows a dismissed share sheet. `notify`/`fail` let the caller
 * surface a toast without this module importing `sonner`.
 */
export async function shareFlowerLink(
  flowerId: string,
  title: string,
  notify?: (msg: string) => void,
  fail?: (msg: string) => void,
): Promise<void> {
  const url = buildShareUrl(flowerBackendBaseUrl, flowerId);
  const shareTitle = title || 'My Petal Pixel flower';
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: shareTitle, url });
    } catch {
      /* user dismissed the share sheet — not an error */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    notify?.('Share link copied');
  } catch {
    fail?.('Could not copy the share link.');
  }
}
