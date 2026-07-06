import { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { FlowerCanvas } from '@/components/flower/FlowerCanvas';
import { FlowerControls } from '@/components/flower/FlowerControls';
import { FlowerInfo } from '@/components/flower/FlowerInfo';
import { FlowerBadges } from '@/components/flower/FlowerBadges';
import { pickSurpriseName } from './surpriseNames';
import { useFlowerStore } from '@/stores/flowerStore';
import { Sparkles, Save, Gem, BarChart3, X, Copy, ExternalLink, AlertTriangle, Pencil, Wallet, Download, Dices, SlidersHorizontal, Image, Film, Loader2, ChevronDown, Share2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { toast } from 'sonner';
import { getRoseFunctionProjections } from '@/math/flowers/rose';
import { BrowserProvider, Contract } from 'ethers';
import {
  checkFlowerBackendHealth,
  confirmMintViaGrpc,
  prepareMintViaGrpc,
  postFlowerPreview,
  buildShareUrl,
  flowerBackendBaseUrl,
} from '@/integrations/flowerBackend/client';
import { captureFlowerPng, captureFlowerGif } from '@/components/flower/snapshot';
import { SharePreview } from '@/components/flower/SharePreview';
import { extractMintedTokenId } from './mintReceipt';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  shouldWarnRegenerate,
  isCheckingBackend,
  hasUnsavedWork,
  type HealthStatus,
} from './createFlowerGuards';
import { mapPetalCount } from '@/components/flower/sliderMapping';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 1337);
const TARGET_RPC_URL = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8545';

async function ensureCorrectNetwork(provider: BrowserProvider) {
  const targetHex = '0x' + TARGET_CHAIN_ID.toString(16);
  const network = await provider.getNetwork();
  if (Number(network.chainId) === TARGET_CHAIN_ID) return;
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: targetHex }]);
  } catch (err: unknown) {
    const switchErr = err as { code?: number };
    if (switchErr?.code === 4902) {
      await provider.send('wallet_addEthereumChain', [
        {
          chainId: targetHex,
          chainName: 'Anvil Local',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [TARGET_RPC_URL],
        },
      ]);
    } else {
      throw err;
    }
  }
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

function MathPanel({ onClose }: { onClose: () => void }) {
  const params = useFlowerStore((s) => s.params);
  const roseGraphs = params.flowerType === 'rose' ? getRoseFunctionProjections(params.roseParams) : null;

  // Derive effective petal count from the ACTIVE technique params (sliders rewired in Task 14).
  const countMap = mapPetalCount(params.flowerType);
  const effectivePetalCount = countMap
    ? (params[countMap.param === 'classic' ? 'classicParams' : 'bloomParams'] as Record<string, number>)[countMap.key] ?? params.petalCount
    : params.petalCount;

  const genericData = Array.from({ length: 120 }, (_, i) => {
    const t = (i / 120) * Math.PI * 2;
    const r = params.petalLength * Math.cos(effectivePetalCount * t) + params.noiseIntensity * Math.sin(params.frequency * t);
    return { t: t.toFixed(2), r, x: r * Math.cos(t), y: r * Math.sin(t) };
  });

  const graphA = roseGraphs
    ? roseGraphs.phiSeries.map((p) => ({ t: p.x.toFixed(2), v: p.y }))
    : genericData.map((p) => ({ t: p.t, v: p.r }));
  const graphB = roseGraphs
    ? roseGraphs.petalCutSeries.map((p) => ({ t: p.x.toFixed(2), v: p.y }))
    : genericData.map((p) => ({ t: p.t, v: p.x }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-0 left-0 right-0 h-[70vh] sm:h-56 glass-panel rounded-t-lg z-20 p-4 overflow-hidden"
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-primary" /> Mathematical Visualization
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:h-[calc(100%-2rem)] overflow-y-auto">
        <div>
          <p className="text-xs text-muted-foreground mb-1 font-mono">
            {roseGraphs ? 'Rose: phi(theta)=180/opening·exp(-theta/(vDensity·180))' : 'Polar: r = L·cos(n·theta) + N·sin(f·theta)'}
          </p>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={graphA}>
              <XAxis dataKey="t" hide />
              <YAxis hide />
              <RechartsTooltip contentStyle={{ background: 'hsl(240 8% 10%)', border: '1px solid hsl(240 6% 18%)', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="v" stroke="hsl(160 84% 39%)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1 font-mono">
            {roseGraphs ? 'Rose: petalCut(theta)' : 'Parametric projection: x(t)'}
          </p>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={graphB}>
              <XAxis dataKey="t" hide />
              <YAxis hide />
              <RechartsTooltip contentStyle={{ background: 'hsl(240 8% 10%)', border: '1px solid hsl(240 6% 18%)', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="v" stroke="hsl(160 84% 39%)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}

function RegenerateWarningDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Regenerate flower?</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          This will regenerate the flower and replace your current parameters, including any unsaved manual changes.
        </p>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-xs px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            Regenerate
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function UnsavedChangesDialog({
  onSaveAndLeave,
  onDiscard,
  onStay,
  isSaving,
}: {
  onSaveAndLeave: () => void;
  onDiscard: () => void;
  onStay: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Unsaved changes</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          You have unsaved changes to this flower. What would you like to do?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndLeave}
            disabled={isSaving}
            className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 font-medium"
          >
            {isSaving ? 'Saving...' : 'Save & Leave'}
          </button>
          <button
            onClick={onDiscard}
            className="text-xs px-4 py-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
          >
            Discard changes
          </button>
          <button
            onClick={onStay}
            className="text-xs px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            Cancel — stay here
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs text-muted-foreground font-semibold w-20 shrink-0 uppercase">{label}</span>
      <span className="text-xs text-foreground font-mono truncate flex-1">{value}</span>
      <button
        onClick={() => { void navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title={`Copy ${label}`}
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
  );
}

export interface MintResult {
  tokenId: number | null;
  contractAddress: string;
  txHash: string;
  tokenUri: string;
}

function MintSuccessDialog({
  result,
  personName,
  onClose,
  onShare,
}: {
  result: MintResult;
  personName: string;
  onClose: () => void;
  onShare: () => void;
}) {
  const params = useFlowerStore((s) => s.params);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Gem className="w-4 h-4 text-primary" /> NFT minted
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your flower is on-chain. Use the details below to import it into MetaMask.
          </DialogDescription>
        </DialogHeader>

        {/* Reused share block: canvas is height-capped (compact) so it fits max-w-md. */}
        <SharePreview params={params} personName={personName} compact />
        <button
          type="button"
          onClick={onShare}
          className="flex items-center justify-center gap-2 h-10 rounded-lg bg-secondary text-secondary-foreground text-xs hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Share2 className="w-3.5 h-3.5" /> Copy share link
        </button>

        <div className="flex flex-col gap-2.5">
          <CopyRow label="Token ID" value={result.tokenId != null ? String(result.tokenId) : 'not detected'} />
          <CopyRow label="Contract" value={result.contractAddress} />
          <CopyRow label="Tx hash" value={result.txHash} />
          {result.tokenUri && (
            <a
              href={result.tokenUri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline font-mono flex items-center gap-1"
            >
              metadata.json <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          )}
        </div>
        <div className="rounded-lg bg-secondary/60 border border-border p-3 text-xs text-muted-foreground leading-relaxed">
          <p>1. In MetaMask, open the NFTs tab and choose "Import NFT".</p>
          <p>2. Paste the contract address and Token ID shown above.</p>
          <p>3. Confirm — your flower appears in your wallet.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Runs the Supabase-backed save and reports the outcome via toast.
// saveFlower now reports which case occurred (Clusters A & D):
//  - 'created': a genuinely new flower was added -> use createdMessage.
//  - 'updated': either the edit path succeeded, or the create path collided
//    with an already-saved flower's deterministic id and was folded into an
//    update of that flower -> use updatedMessage.
//  - 'aborted': the flower being edited no longer exists (deleted) -> this is
//    NOT a success; toast an error instead and return false.
// Returns true only on success (created/updated); on failure or abort surfaces
// an error toast and returns false.
export async function runSaveFlow(
  saveFlower: () => Promise<'created' | 'updated' | 'aborted'>,
  messages: { createdMessage: string; updatedMessage: string },
): Promise<boolean> {
  try {
    const result = await saveFlower();
    if (result === 'aborted') {
      toast.error('This flower was deleted — nothing to update.');
      return false;
    }
    toast.success(result === 'created' ? messages.createdMessage : messages.updatedMessage);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save flower';
    toast.error(message);
    return false;
  }
}

export default function CreateFlower() {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useFlowerStore((s) => s.params);
  const generationWord = useFlowerStore((s) => s.generationWord);
  const title = useFlowerStore((s) => s.title);
  const editingFlowerId = useFlowerStore((s) => s.editingFlowerId);
  const savedFlowers = useFlowerStore((s) => s.savedFlowers);
  const isGenerating = useFlowerStore((s) => s.isGenerating);
  const generateFromWord = useFlowerStore((s) => s.generateFromWord);
  const saveFlower = useFlowerStore((s) => s.saveFlower);
  const setTitle = useFlowerStore((s) => s.setTitle);
  const markMintedByBackendFlowerId = useFlowerStore((s) => s.markMintedByBackendFlowerId);
  const clearEditMode = useFlowerStore((s) => s.clearEditMode);

  // Lazy init: if already in edit mode on mount, pre-fill inputs from the store
  // so wordInput/titleInput start in sync and don't cause a false hasUnsavedChanges.
  const [wordInput, setWordInput] = useState(() => {
    const s = useFlowerStore.getState();
    return s.editingFlowerId ? s.generationWord : '';
  });
  const [titleInput, setTitleInput] = useState(() => {
    const s = useFlowerStore.getState();
    return s.editingFlowerId ? s.title : '';
  });
  const [showMath, setShowMath] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');
  const [walletAddress, setWalletAddress] = useState('');
  const [isMinting, setIsMinting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mintTxHash, setMintTxHash] = useState('');
  const [mintTokenUri, setMintTokenUri] = useState('');
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [showRegenerateWarning, setShowRegenerateWarning] = useState(false);
  const [paramsDirty, setParamsDirty] = useState(false);
  // UI-only: GIF encode in-flight (spinner + disabled state + re-entry guard).
  const [isEncodingGif, setIsEncodingGif] = useState(false);
  // UI-only: mobile/tablet controls drawer visibility. Does NOT touch generation/mint state.
  const [controlsOpen, setControlsOpen] = useState(false);

  const isEditMode = editingFlowerId !== null;

  const originalWordRef = useRef(generationWord);
  const originalTitleRef = useRef(title);
  const originalParamsRef = useRef('');

  // Single reconciliation effect for every /create mount / same-route
  // navigation event (location.key is unique per navigation, so this fires
  // even for same-route re-entry, e.g. re-clicking the sidebar "Create
  // Flower" link). Combines Clusters B2/B3 (don't destroy fresh create-mode
  // work-in-progress) and C (durable route state vs. non-persisted store
  // edit context can disagree after F5 or Back/Forward).
  //
  // location.state.isEditing survives F5/back-forward (it lives in
  // history.state), but editingFlowerId/params/title/generationWord do not
  // (persist partialize only keeps savedFlowers/ownerUserId). That split
  // creates three cases to reconcile on entry, checked in order:
  //
  //  1. Route says isEditing, but the store has NO editingFlowerId (reload
  //     mid-edit wiped it) → pseudo-edit with blank state. Replace the route
  //     state so it stops claiming an edit session, tell the user once, and
  //     continue in clean create mode. Do NOT clearEditMode's params reset
  //     here — the store is already at defaults.
  //  2. The store DOES have an editingFlowerId, but that flower is no longer
  //     in savedFlowers (deleted — e.g. via another tab, or a stale Back into
  //     an old history entry after deletion) → clear edit mode and inputs so
  //     the page doesn't pretend to edit a flower that no longer exists.
  //  3. Route does NOT say isEditing, but the store still holds a (valid)
  //     leftover editingFlowerId from a previous /create visit that the user
  //     left without discarding → clear edit mode and inputs. This is the
  //     ONLY case that calls clearEditMode for a plain fresh-create entry;
  //     previously clearEditMode ran unconditionally here, which also wiped
  //     params/title/generationWord for a genuine create-mode WIP flower
  //     (Cluster B2) — it is now gated on an edit session actually existing.
  //
  // In every other case (fresh create with no edit residue, or a valid
  // ongoing edit session) this is a deliberate no-op: create-mode WIP and
  // edit-mode state are left completely untouched.
  useEffect(() => {
    const store = useFlowerStore.getState();

    if (location.state?.isEditing && !store.editingFlowerId) {
      navigate('.', { replace: true, state: null });
      toast.info('Your edit session was reset by the reload — starting a fresh flower.');
      return;
    }

    if (store.editingFlowerId && !savedFlowers.some(f => f.id === store.editingFlowerId)) {
      clearEditMode();
      setWordInput('');
      setTitleInput('');
      return;
    }

    if (!location.state?.isEditing && store.editingFlowerId) {
      clearEditMode();
      // Cluster B3: the local word/title inputs are only ever synced FROM the
      // store while isEditMode is true (see the sync effect below), so they
      // must be cleared explicitly here — otherwise the stale word/title of
      // the just-exited edit session prefill the "fresh" create page and can
      // steer a subsequent Generate+Save into re-colliding with that same
      // flower's deterministic backend id.
      setWordInput('');
      setTitleInput('');
    }
  // Deliberately keyed on location.key only (not savedFlowers), so this
  // reconciliation runs once per navigation event rather than fighting with
  // in-progress edits every time savedFlowers changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Snapshot originals when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      originalWordRef.current = generationWord;
      originalTitleRef.current = title;
      originalParamsRef.current = JSON.stringify(params);
      setParamsDirty(false);
    } else {
      setParamsDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFlowerId]);

  // Detect param (slider) changes while in edit mode
  useEffect(() => {
    if (isEditMode && originalParamsRef.current) {
      setParamsDirty(JSON.stringify(params) !== originalParamsRef.current);
    }
  }, [params, isEditMode]);

  // Cluster B1: in edit mode, dirty means "differs from the saved snapshot"
  // (existing behavior). In CREATE mode, a generated-but-unsaved flower
  // (params.flowerId set, id not yet present in savedFlowers) is now also
  // considered unsaved work, so the blocker/beforeunload guards below protect
  // it — previously they were permanently inert outside edit mode.
  const editModeDirty = wordInput !== originalWordRef.current ||
    titleInput !== originalTitleRef.current ||
    paramsDirty;
  const savedFlowerIds = useMemo(() => new Set(savedFlowers.map(f => f.id)), [savedFlowers]);
  const hasUnsavedChanges = hasUnsavedWork(
    isEditMode,
    editModeDirty,
    /* wordChanged unused in create branch */ false,
    params.flowerId,
    savedFlowerIds,
  );

  const blocker = useBlocker(hasUnsavedChanges);

  // Bug 4: guard browser refresh / tab close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    if (hasUnsavedChanges) {
      window.addEventListener('beforeunload', handler);
    }
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    void handleCheckBackend();
  }, []);

  useEffect(() => {
    if (isEditMode) {
      setWordInput(generationWord);
      setTitleInput(title);
    }
  }, [isEditMode, generationWord, title]);

  const handleCheckBackend = async () => {
    if (isCheckingBackend(healthStatus)) return;
    setHealthStatus('checking');
    try {
      const ok = await checkFlowerBackendHealth();
      setHealthStatus(ok ? 'ok' : 'error');
      if (ok) toast.success('Backend is reachable');
    } catch {
      setHealthStatus('error');
      toast.error('Backend is offline. Start the Go server first.');
    }
  };

  // Shared blob-to-anchor download helper (PNG + GIF reuse the same sanitized-title
  // filename and object-URL lifecycle).
  const triggerDownload = (blob: Blob, ext: 'png' | 'gif') => {
    const safeTitle = (titleInput.trim() || generationWord || 'flower').replace(/[\\/:*?"<>|]/g, '_');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeTitle}.${ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = async () => {
    const blob = await captureFlowerPng();
    if (!blob) {
      toast.error('Could not capture the flower image. Is the 3D view visible?');
      return;
    }
    triggerDownload(blob, 'png');
  };

  const handleDownloadGif = async () => {
    if (isEncodingGif) return; // re-entry guard, matches other handlers
    setIsEncodingGif(true);
    const toastId = toast.loading('Rendering GIF…');
    try {
      const blob = await captureFlowerGif({ frames: 36, size: 512, background: 'dark' });
      if (!blob) {
        toast.error('Could not render the GIF. Is the 3D view visible?', { id: toastId });
        return;
      }
      triggerDownload(blob, 'gif');
      toast.success('GIF downloaded', { id: toastId });
    } catch {
      toast.error('GIF export failed.', { id: toastId });
    } finally {
      setIsEncodingGif(false);
    }
  };

  const handleShare = async () => {
    if (!params.flowerId) {
      toast.error('Save or generate a flower first.');
      return;
    }
    // The share link points at the backend /share/:id OG route so crawlers get
    // the preview HTML and humans are redirected on to the SPA.
    const url = buildShareUrl(flowerBackendBaseUrl, params.flowerId);
    const shareTitle = titleInput.trim() || generationWord || 'My Petal Pixel flower';
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
      toast.success('Share link copied');
    } catch {
      toast.error('Could not copy the share link.');
    }
  };

  const handleConnectWallet = async (): Promise<string | null> => {
    if (!window.ethereum) {
      toast.error('MetaMask not found. Install MetaMask and connect to Ganache RPC.');
      return null;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      await ensureCorrectNetwork(provider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      toast.success(`Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);
      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      toast.error(message);
      return null;
    }
  };

  const handleWordInputChange = (value: string) => {
    const sanitized = value.replace(/\s+/g, ' ').slice(0, 64);
    setWordInput(sanitized);
  };

  const doGenerate = async (word: string) => {
    try {
      await generateFromWord(word);
      setTitleInput(useFlowerStore.getState().title);
      toast.success('Flower generated from backend');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend is offline or generation failed';
      toast.error(message);
    }
  };

  const handleGenerate = async (overrideWord?: string) => {
    if (isGenerating) return;
    const word = (overrideWord ?? wordInput).trim();
    if (!word) {
      toast.error('Enter a name or phrase first.');
      return;
    }
    if (shouldWarnRegenerate(isEditMode, word, generationWord, paramsDirty)) {
      setShowRegenerateWarning(true);
      return;
    }

    await doGenerate(word);
  };

  const handleConfirmRegenerate = async () => {
    setShowRegenerateWarning(false);
    await doGenerate(wordInput.trim());
  };

  const handleSurpriseMe = () => {
    if (isGenerating) return;
    const name = pickSurpriseName();
    setWordInput(name); // entries are pre-sanitized to the input's contract
    void handleGenerate(name); // same guarded path: isGenerating + regen dialog
  };

  const handleTitleChange = (value: string) => {
    setTitleInput(value);
    setTitle(value);
  };

  const handleSave = async (): Promise<boolean> => {
    if (isSaving) return false;
    if (!params.flowerId) {
      toast.error('Generate a flower first before saving.');
      return false;
    }
    if (!titleInput.trim()) {
      toast.error('Give your flower a title before saving.');
      return false;
    }
    setIsSaving(true);
    try {
      setTitle(titleInput.trim());
      const ok = await runSaveFlow(saveFlower, {
        // Cluster A: a create-path save that collides with an already-saved
        // flower's deterministic id is folded into an update of that flower,
        // so its message must say "updated", not "saved" — otherwise the
        // user is told a new flower was created when their existing one was
        // actually just modified in place.
        createdMessage: 'Flower saved to your collection!',
        updatedMessage: 'Flower updated!',
      });
      if (ok) {
        // Reset dirty tracking after a successful save. Also re-sync the
        // title input in case the collision path (Cluster A) preserved the
        // existing saved title instead of the freshly-typed one.
        const freshState = useFlowerStore.getState();
        originalParamsRef.current = JSON.stringify(freshState.params);
        originalWordRef.current = wordInput;
        originalTitleRef.current = freshState.title;
        setTitleInput(freshState.title);
        setParamsDirty(false);

        // Capture-at-SAVE: best-effort OG/preview image for the share landing.
        // Fire-and-forget against the freshly-saved backend id. Wrapped so it
        // can NEVER reject or block the save (no WebGL → captureFlowerPng
        // returns null → guard skips the POST; a failing endpoint is swallowed
        // by postFlowerPreview). Never toasts on failure — the OG image is
        // strictly best-effort.
        const savedId = useFlowerStore.getState().params.flowerId;
        if (savedId) {
          void (async () => {
            try {
              const png = await captureFlowerPng();
              if (png) void postFlowerPreview(savedId, png);
            } catch {
              /* best-effort: never surface a preview-capture failure */
            }
          })();
        }
      }
      return ok;
    } finally {
      setIsSaving(false);
    }
  };

  const handleMint = async () => {
    // Re-entry guard: matches the if (isGenerating) return pattern used for other handlers.
    if (isMinting) return;
    if (!params.flowerId) {
      toast.error('Generate flower from backend first.');
      return;
    }

    // Defect #4: never mint a regenerated-but-unsaved flower. If the on-chain
    // flowerId isn't yet persisted (edit mode with unsaved changes, or the
    // params.flowerId doesn't match any saved backendFlowerId), save first so the
    // mint is recorded against a real savedFlowers row.
    const savedFlowers = useFlowerStore.getState().savedFlowers;
    const isPersisted = savedFlowers.some((f) => f.backendFlowerId === params.flowerId);
    if (hasUnsavedChanges || !isPersisted) {
      // Check for concurrent save before calling handleSave, so we can distinguish
      // the isSaving early-return (silent) from a real save error (handleSave toasts itself).
      if (isSaving) {
        toast.info('Save in progress — try minting again in a moment.');
        return;
      }
      const saved = await handleSave();
      if (!saved) {
        // handleSave already toasted the reason (e.g. missing title). Abort mint.
        return;
      }
    }

    if (!window.ethereum) {
      toast.error('Ethereum provider not found.');
      return;
    }

    // Ensure wallet is connected. The returned address from handleConnectWallet() is
    // used only as a gate here; the live signer address is read from provider.getSigner()
    // below to avoid stale-closure issues.
    if (!walletAddress) {
      const connected = await handleConnectWallet();
      if (!connected) return; // rejected / no wallet — handleConnectWallet already toasted
    }

    setIsMinting(true);
    setMintTxHash('');
    setMintTokenUri('');

    try {
      const provider = new BrowserProvider(window.ethereum);
      await ensureCorrectNetwork(provider);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      // Snapshot the rendered flower for the NFT image. Capture failure must
      // never block the mint — degrade to metadata without an image.
      let imageBytes: Uint8Array | undefined;
      try {
        const png = await captureFlowerPng();
        if (png) {
          imageBytes = new Uint8Array(await png.arrayBuffer());
        } else {
          toast.info('Could not capture flower image — minting without a preview.');
        }
      } catch {
        toast.info('Could not capture flower image — minting without a preview.');
      }

      const prepared = await prepareMintViaGrpc(params.flowerId, signerAddress, imageBytes);
      if (!prepared.contractAddress) {
        throw new Error('Backend returned empty NFT contract address. Set NFT_CONTRACT_ADDRESS in backend env.');
      }

      const mintAbi = ['function mint(address to, string tokenURI) returns (uint256)'];
      const contract = new Contract(prepared.contractAddress, mintAbi, signer);

      const tx = await contract.mint(prepared.mintTo || signerAddress, prepared.mintTokenUri || prepared.tokenUri);
      toast.info(`Mint tx sent: ${tx.hash}`);

      // Finding 3: don't set mintTxHash (which drives the emerald "success"
      // banner) until tx.wait() actually resolves. A submitted tx can still
      // revert on-chain (e.g. the documented onlyOwner revert for a wrong
      // wallet) — tx.wait() throws in that case and is caught below, but if
      // we'd already stamped the hash into state, the success-styled banner
      // would still show a failed/reverted tx. Only a confirmed tx may
      // populate mintTxHash.
      const receipt = await tx.wait();
      const confirmedHash = (receipt?.hash as string | undefined) || (tx.hash as string);
      setMintTxHash(confirmedHash);
      await confirmMintViaGrpc(params.flowerId, confirmedHash);

      // ERC-721 Transfer(from=0x0, to, tokenId): tokenId is the third indexed topic.
      const tokenId = receipt ? extractMintedTokenId(receipt.logs, prepared.contractAddress) : null;

      const tokenUri = prepared.mintTokenUri || prepared.tokenUri;
      if (tokenUri) setMintTokenUri(tokenUri);

      const synced = await markMintedByBackendFlowerId(params.flowerId, confirmedHash, tokenUri || undefined, {
        ...(tokenId != null ? { tokenId } : {}),
        contractAddress: prepared.contractAddress,
      });
      if (synced) {
        toast.success('NFT minted and confirmed in backend');
      } else {
        toast.warning('Minted on-chain but failed to sync to your collection');
      }

      setMintResult({
        tokenId,
        contractAddress: prepared.contractAddress,
        txHash: confirmedHash,
        tokenUri: tokenUri || '',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mint failed';
      if (message.toLowerCase().includes('not_found') || message.toLowerCase().includes('not found')) {
        toast.error('Flower not found in backend — click Generate again to re-sync it, then try minting.');
      } else {
        toast.error(message);
      }
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      {showRegenerateWarning && (
        <RegenerateWarningDialog
          onConfirm={() => void handleConfirmRegenerate()}
          onCancel={() => setShowRegenerateWarning(false)}
        />
      )}

      {blocker.state === 'blocked' && (
        <UnsavedChangesDialog
          isSaving={isSaving}
          onSaveAndLeave={async () => { if (await handleSave()) blocker.proceed(); }}
          onDiscard={() => { clearEditMode(); blocker.proceed(); }}
          onStay={() => blocker.reset()}
        />
      )}

      {mintResult && (
        <MintSuccessDialog
          result={mintResult}
          personName={titleInput.trim() || generationWord || title}
          onClose={() => setMintResult(null)}
          onShare={() => void handleShare()}
        />
      )}

      <div className="flex-1 flex flex-col relative min-h-0">
        {/* Top bar */}
        <div className="border-b border-border flex flex-col bg-card/50">
          {/* Row 1: inputs */}
          <div className="flex items-center gap-2 px-3 pt-2 pb-1 flex-wrap">
            <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2.5 py-1.5 min-w-0 flex-1 max-w-[260px]">
              <input
                type="text"
                value={wordInput}
                onChange={(e) => handleWordInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) void handleGenerate();
                }}
                placeholder="Enter a name or phrase..."
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full font-mono min-w-0"
              />
              <button
                onClick={handleSurpriseMe}
                disabled={isGenerating}
                title="Surprise me"
                aria-label="Surprise me"
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Dices className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => void handleGenerate()}
                disabled={isGenerating}
                className="bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-md font-medium hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0"
              >
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">{isGenerating ? 'Generating...' : 'Generate'}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2.5 py-1.5 min-w-0 flex-1 max-w-[220px]">
              <Pencil className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={titleInput}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Flower title..."
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full min-w-0"
              />
            </div>
          </div>

          {/* Row 2: actions */}
          <div className="flex items-center gap-1.5 px-3 pb-2 pt-0.5 flex-wrap">
            <button
              onClick={() => setControlsOpen(true)}
              title="Open controls"
              className="lg:hidden flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-primary"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Controls</span>
            </button>

            <button
              onClick={handleCheckBackend}
              disabled={isCheckingBackend(healthStatus)}
              title={healthStatus === 'ok' ? 'Backend online' : healthStatus === 'error' ? 'Backend offline' : 'Check backend'}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className={`w-2 h-2 rounded-full ${healthStatus === 'ok' ? 'bg-emerald-400' : healthStatus === 'error' ? 'bg-rose-400' : healthStatus === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-muted-foreground'}`} />
              <span className="hidden md:inline">{healthStatus === 'checking' ? 'Checking...' : 'Backend'}</span>
            </button>

            <button
              onClick={() => void handleConnectWallet()}
              title="Connect wallet"
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              <Wallet className="w-3 h-3 shrink-0" />
              <span className="hidden md:inline">
                {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Wallet'}
              </span>
            </button>

            <button
              onClick={() => void handleSave()}
              disabled={isSaving || isGenerating}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3 h-3" />
              <span>{isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Save'}</span>
            </button>

            <TooltipProvider>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild disabled={isEncodingGif}>
                      <button
                        type="button"
                        disabled={isEncodingGif}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                      >
                        {isEncodingGif
                          ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
                          : <Download className="w-3 h-3" />}
                        <span className="hidden sm:inline">{isEncodingGif ? 'Encoding…' : 'Download'}</span>
                        <ChevronDown className="w-3 h-3 opacity-70" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                    PNG is a still frame. GIF spins 36 frames — larger file (~1–4MB), a few seconds to encode.
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  <DropdownMenuItem onSelect={() => void handleDownloadPng()} className="text-xs gap-2">
                    <Image className="w-3.5 h-3.5" /> PNG · still frame
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); void handleDownloadGif(); }}
                    disabled={isEncodingGif}
                    className="text-xs gap-2"
                  >
                    <Film className="w-3.5 h-3.5" /> GIF · spinning (512²)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>

            <button
              onClick={() => void handleShare()}
              title="Share this flower"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Share2 className="w-3 h-3" />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button
              onClick={() => void handleMint()}
              disabled={isMinting}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Gem className="w-3 h-3" />
              <span className="hidden sm:inline">{isMinting ? 'Minting...' : 'Mint NFT'}</span>
            </button>
          </div>

          {isEditMode && (
            <div className="px-3 py-1 border-t border-border bg-amber-950/20 flex items-center gap-2">
              <Pencil className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-300 truncate">
                Editing: <span className="font-semibold">{title}</span>
                <span className="text-amber-400/60 ml-2">word: {generationWord}</span>
              </span>
            </div>
          )}
        </div>

        {(mintTxHash || mintTokenUri) && (
          <div className="px-3 py-1.5 border-b border-border bg-emerald-950/30 flex flex-wrap items-center gap-x-4 gap-y-1">
            {mintTxHash && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-emerald-400 font-semibold shrink-0">TX</span>
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{mintTxHash}</span>
                <button
                  onClick={() => { void navigator.clipboard.writeText(mintTxHash); toast.success('Tx hash copied'); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy tx hash"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}
            {mintTokenUri && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-emerald-400 font-semibold shrink-0">NFT</span>
                <a
                  href={mintTokenUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline font-mono truncate max-w-[200px] flex items-center gap-1"
                >
                  metadata.json <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative">
          <FlowerCanvas />
          <FlowerBadges />
          <FlowerInfo />

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowMath(!showMath)}
            className="absolute bottom-4 right-4 w-10 h-10 rounded-lg glass-panel flex items-center justify-center z-10 text-muted-foreground hover:text-primary transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
          </motion.button>

          {showMath && <MathPanel onClose={() => setShowMath(false)} />}
        </div>
      </div>

      {/* Desktop: persistent side panel */}
      <div className="hidden lg:block">
        <FlowerControls />
      </div>

      {/* Mobile/tablet: bottom-sheet drawer */}
      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent
          side="bottom"
          className="lg:hidden h-[80vh] p-0 flex flex-col bg-card"
        >
          <SheetHeader className="px-4 pt-4 pb-2 text-left">
            <SheetTitle className="text-sm">Flower Controls</SheetTitle>
            <SheetDescription className="text-xs">Adjust parameters in real-time</SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FlowerControls className="w-full h-full border-l-0" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
