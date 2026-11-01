import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sparkles, Flower2, Twitter, Send, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchFlowerById,
  buildShareUrl,
  flowerBackendBaseUrl,
  type FlowerListItem,
} from '@/integrations/flowerBackend/client';
import { mapBackendJsonToFlowerParams } from './shareParams';
import { SharePreview } from '@/components/flower/SharePreview';
import { captureFlowerPng } from '@/components/flower/snapshot';
import { buildTweetUrl, buildTelegramUrl, shareCardText, shareCardFilename } from '@/lib/shareCard';

type Status = 'loading' | 'ready' | 'notfound' | 'error';

/**
 * Public, logged-out flower landing served at `/share/:flowerId` (a sibling of
 * ProtectedRoute in App.tsx — no auth required). Fetches the flower over plain
 * HTTP, maps the persisted params to FlowerParams, and renders a big centered
 * preview with CTAs. No DashboardLayout / sidebar.
 */
export default function ShareFlower() {
  const { flowerId } = useParams<{ flowerId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [item, setItem] = useState<FlowerListItem | null>(null);
  const [yourName, setYourName] = useState('');
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!flowerId) {
      setStatus('notfound');
      return;
    }
    setStatus('loading');
    fetchFlowerById(flowerId)
      .then((data) => {
        if (cancelled) return;
        setItem(data);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        setStatus(msg === 'not_found' ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [flowerId]);

  // Viral loop: build the SPA deep-link that seeds the create page with this
  // visitor's own name. Reading `?name=` back out is feat-create's job — this
  // page only emits the link shape `/create?name=<encoded>`.
  const handleMakeYourOwn = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = yourName.trim();
    if (!trimmed) return;
    navigate(`/create?name=${encodeURIComponent(trimmed)}`);
  };

  // Blob-to-anchor download, mirroring CreateFlower's triggerDownload pattern
  // (kept local here — ShareFlower may not import from CreateFlower.tsx).
  const handleDownloadCard = async () => {
    if (isDownloadingCard || !item) return;
    setIsDownloadingCard(true);
    try {
      const blob = await captureFlowerPng();
      if (!blob) {
        toast.error('Could not capture the flower image. Is the preview visible?');
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = shareCardFilename(item.person_name);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingCard(false);
    }
  };

  return (
    <div className="min-h-screen bg-background grid-bg">
      <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight">Petal Pixel</span>
        </Link>
        <Link
          to="/create"
          className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open the studio
        </Link>
      </header>

      <main className="px-4 sm:px-8 py-8 sm:py-12 flex items-center justify-center">
        {status === 'loading' && (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
          </div>
        )}

        {(status === 'notfound' || status === 'error') && (
          <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3">
            <Flower2 className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {status === 'notfound'
                ? "This flower doesn't exist or is no longer shared."
                : 'Something went wrong loading this flower.'}
            </p>
            <Link
              to="/create"
              className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Back to studio
            </Link>
          </div>
        )}

        {status === 'ready' && item && (
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
            <SharePreview
              params={mapBackendJsonToFlowerParams(item.flower_id, item.params)}
              personName={item.person_name}
              onOpenStudio={() => navigate('/create')}
              onMint={() => navigate('/create')}
            />

            <form
              onSubmit={handleMakeYourOwn}
              className="flex flex-col sm:flex-row gap-2 p-4 rounded-xl border border-border bg-card"
            >
              <div className="flex-1 flex flex-col gap-1.5">
                <label htmlFor="your-name" className="text-xs font-medium text-foreground">
                  Make one for your name
                </label>
                <input
                  id="your-name"
                  type="text"
                  value={yourName}
                  onChange={(e) => setYourName(e.target.value)}
                  placeholder="Your name"
                  className="h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
              <button
                type="submit"
                disabled={!yourName.trim()}
                className="sm:self-end h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Bloom mine
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              <a
                href={buildTweetUrl(
                  buildShareUrl(flowerBackendBaseUrl, item.flower_id),
                  shareCardText(item.person_name),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Twitter className="w-4 h-4" /> Share on X
              </a>
              <a
                href={buildTelegramUrl(
                  buildShareUrl(flowerBackendBaseUrl, item.flower_id),
                  shareCardText(item.person_name),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Send className="w-4 h-4" /> Share on Telegram
              </a>
              <button
                type="button"
                onClick={handleDownloadCard}
                disabled={isDownloadingCard}
                className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Download className="w-4 h-4" /> {isDownloadingCard ? 'Preparing…' : 'Download card'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
