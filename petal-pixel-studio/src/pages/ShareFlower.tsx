import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchFlowerById,
  buildShareUrl,
  flowerBackendBaseUrl,
  type FlowerListItem,
} from '@/integrations/flowerBackend/client';
import { BloomView } from '@/components/flower/BloomView';
import { captureFlowerPng } from '@/components/flower/snapshot';
import { buildTweetUrl, buildTelegramUrl, shareCardText, shareCardFilename } from '@/lib/shareCard';
import { kindOf } from '@/math/blossom/identity';
import '@/styles/petal.css';

type Status = 'loading' | 'ready' | 'notfound' | 'error';

/**
 * The page a shared flower opens on, with no account needed. The flower is grown
 * here from its name, so what the visitor sees is what its owner saw.
 */
export default function ShareFlower() {
  const { flowerId } = useParams<{ flowerId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [item, setItem] = useState<FlowerListItem | null>(null);
  const [yourName, setYourName] = useState('');
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);
  const yourField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    const before = document.title;
    document.title = `${item.person_name.trim()}'s ${kindOf(item.person_name)} · Petal Pixel`;
    return () => {
      document.title = before;
    };
  }, [item]);

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

  // Growing your own needs no account, so this goes to the home page, not the console.
  const handleMakeYourOwn = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = yourName.trim();
    if (trimmed) navigate(`/#name=${encodeURIComponent(trimmed)}`);
    else yourField.current?.focus();
  };

  const handleDownloadCard = async () => {
    if (isDownloadingCard || !item) return;
    setIsDownloadingCard(true);
    try {
      const blob = await captureFlowerPng({ caption: true });
      if (!blob) {
        toast.error("Couldn't draw the picture. Check that the flower is showing, then try again.");
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

  const name = item?.person_name.trim() ?? '';
  const shareUrl = item ? buildShareUrl(flowerBackendBaseUrl, item.flower_id) : '';

  return (
    <div className="pp share">
      <header className="pp-bar">
        <Link className="pp-bar__mark" to="/">Petal Pixel</Link>
        <Link className="pp-button" to="/console">Your garden</Link>
      </header>

      {status === 'loading' && <p className="share__state" role="status">Finding this flower.</p>}

      {(status === 'notfound' || status === 'error') && (
        <div className="share__state">
          <h1>{status === 'notfound' ? 'This flower is not here.' : "This flower didn't load."}</h1>
          <p>
            {status === 'notfound'
              ? 'It may have been deleted, or the link may be missing a part.'
              : 'Check your connection and open the link again.'}
          </p>
          <Link className="pp-button" to="/">Grow a flower</Link>
        </div>
      )}

      {status === 'ready' && item && (
        <main className="share__flower">
          <div className="share__stage">
            <BloomView name={name} shift caption={false} />
          </div>
          <div className="share__words">
            <h1>{name}'s {kindOf(name)}.</h1>
            <p>The same name always grows this same flower, on any device, for anyone.</p>

            <form className="share__yours" onSubmit={handleMakeYourOwn}>
              <input
                ref={yourField}
                className="field"
                aria-label="Your name"
                placeholder="Your name"
                maxLength={64}
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
              />
              <button className="pp-button" type="submit">Grow yours</button>
            </form>

            <div className="share__links">
              <a href={buildTweetUrl(shareUrl, shareCardText(name))} target="_blank" rel="noopener noreferrer">Share on X</a>
              <a href={buildTelegramUrl(shareUrl, shareCardText(name))} target="_blank" rel="noopener noreferrer">Share on Telegram</a>
              <button type="button" onClick={() => void handleDownloadCard()} disabled={isDownloadingCard}>
                {isDownloadingCard ? 'Preparing' : 'Download a picture'}
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
