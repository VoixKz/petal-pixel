import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sparkles, Flower2 } from 'lucide-react';
import { fetchFlowerById, type FlowerListItem } from '@/integrations/flowerBackend/client';
import { mapBackendJsonToFlowerParams } from './shareParams';
import { SharePreview } from '@/components/flower/SharePreview';

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
          <SharePreview
            params={mapBackendJsonToFlowerParams(item.flower_id, item.params)}
            personName={item.person_name}
            onOpenStudio={() => navigate('/create')}
            onMint={() => navigate('/create')}
          />
        )}
      </main>
    </div>
  );
}
