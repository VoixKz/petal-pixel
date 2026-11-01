import { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { BloomView } from '@/components/flower/BloomView';
import { FlowerThumb } from '@/components/flower/FlowerThumb';
import { pickSurpriseName } from './surpriseNames';
import { useFlowerStore } from '@/stores/flowerStore';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles, Save, Gem, Copy, ExternalLink, AlertTriangle, Pencil, Wallet, Download, Dices, Image, Film, Loader2, ChevronDown, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { kindOf, tintOf } from '@/math/blossom/identity';
import type { BrowserProvider } from 'ethers';
import {
  confirmMintViaGrpc,
  prepareMintViaGrpc,
  postFlowerPreview,
  buildShareUrl,
  flowerBackendBaseUrl,
} from '@/integrations/flowerBackend/client';
import { captureFlowerPng, captureFlowerGif } from '@/components/flower/snapshot';
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
  hasUnsavedWork,
  mintErrorMessage,
} from './createFlowerGuards';
import { MINT_ABI, buildMintCall, MINT_OPEN } from '@/lib/mintVoucher';

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

// ── Input affordances: variations, recent-name chips, first-visit prefill ────
// Pure, dependency-light helpers kept INLINE in this file (single-file
// ownership for this change). NOTHING here calls the backend or mutates the
// store — determinism is inherited from the single existing generateFromWord
// path these words feed: same (name, index) → same word → same SHA-256 seed →
// same flower. The v1 path and v1 saved flowers stay pixel-identical.

// Mirrors the name input's contract (see handleWordInputChange), plus a trim.
function sanitizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 64);
}

// Fixed salt appended to the base name before it feeds the deterministic
// generate path. Keep VARIATION_SEP stable so a given name's siblings stay
// stable across builds. 1-based index for human-readable labels ("#1").
const VARIATION_SEP = ' #';
function variationWord(name: string, index: number): string {
  return `${name.trim()}${VARIATION_SEP}${index + 1}`;
}

interface FlowerVariation { key: string; word: string; gradient: string }

// 3–4 deterministic siblings of the current name; [] for a blank name so the
// row disappears on cold-start (no noise before the user has typed anything).
function buildVariations(name: string, count = 4): FlowerVariation[] {
  const base = name.trim();
  if (!base) return [];
  return Array.from({ length: count }, (_, i) => {
    const word = variationWord(base, i);
    return { key: String(i), word, gradient: tintOf(word) };
  });
}

// Newest-first, de-duplicated recent generation words from the user's saved
// flowers; skips blanks and the "unknown" placeholder the store writes when a
// flower has no captured word.
function recentGenerationWords(
  flowers: { generationWord?: string }[],
  limit = 6,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = flowers.length - 1; i >= 0 && out.length < limit; i--) {
    const w = flowers[i].generationWord?.trim();
    if (!w || w === 'unknown' || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

// One-shot entry prefill precedence: an explicit ?name= deep-link always wins
// and does NOT consume the onboarding gate (a first-time user arriving via a
// shared link still gets their display-name prefill on a later plain visit).
// Otherwise, on first visit only, prefill the loaded display name and mark
// onboarded. A not-yet-loaded display name yields a no-op so a later render
// (when it loads) can retry.
function resolveInitialName(opts: {
  queryName: string | null;
  displayName: string | null | undefined;
  hasOnboarded: boolean;
}): { name: string; markOnboarded: boolean } {
  const q = opts.queryName ? sanitizeName(opts.queryName) : '';
  if (q) return { name: q, markOnboarded: false };
  if (!opts.hasOnboarded) {
    const dn = opts.displayName ? sanitizeName(opts.displayName) : '';
    if (dn) return { name: dn, markOnboarded: true };
  }
  return { name: '', markOnboarded: false };
}

// Device-local "has the user seen the Create studio at least once" flag.
// A one-shot gate for the first-visit name prefill, NOT a Settings toggle, so
// it lives under its own localStorage key and is try/catch-guarded so a
// throwing/absent localStorage (SSR, private mode) degrades to "not onboarded".
const CREATE_ONBOARDED_KEY = 'petal-create-onboarded';

function hasCreateOnboarded(): boolean {
  try {
    return localStorage.getItem(CREATE_ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

function markCreateOnboarded(): void {
  try {
    localStorage.setItem(CREATE_ONBOARDED_KEY, '1');
  } catch {
    /* best-effort; a failed write just means the prefill may repeat */
  }
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
          A different name grows a different flower, and it replaces the one you are editing.
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
  const generationWord = useFlowerStore((s) => s.generationWord);
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

        <FlowerThumb name={generationWord} className="h-48 relative overflow-hidden rounded-lg" />
        <p className="text-sm font-semibold text-foreground break-words">{personName}</p>
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

// Runs the server-backed save and reports the outcome via toast.
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
  const { profile } = useAuth();

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

  const isEditMode = editingFlowerId !== null;

  const originalWordRef = useRef(generationWord);
  const originalTitleRef = useRef(title);
  const originalParamsRef = useRef('');

  // Name input, so the prefill/recent affordances can focus it after refilling.
  const nameInputRef = useRef<HTMLInputElement>(null);
  // One-shot guard so a late-loading display name / re-render never clobbers
  // text the user has since typed.
  const prefilledRef = useRef(false);

  // Deterministic "more like this" siblings of the current name, and the
  // user's recent generation words. Both are pure/derived — no store writes.
  const variations = useMemo(() => buildVariations(wordInput), [wordInput]);
  const recentNames = useMemo(() => recentGenerationWords(savedFlowers), [savedFlowers]);

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
    if (isEditMode) {
      setWordInput(generationWord);
      setTitleInput(title);
    }
  }, [isEditMode, generationWord, title]);

  // One-shot entry prefill: an explicit ?name= deep-link (viral loop) wins over
  // the first-visit onboarding prefill and does NOT consume the onboarding
  // gate. Guarded by prefilledRef and !wordInput so it never clobbers text the
  // user has typed; depends on `profile` so a late-loading display name still
  // prefills. Sets only local wordInput — it never calls generate, so it can't
  // manufacture false unsaved work (params.flowerId stays empty). Keyed on
  // location.key so it re-runs per navigation, in step with the reconciliation
  // effect above that may clear wordInput on a stale edit exit.
  //
  // isEditMode is also a dep: the reconciliation effect above (defined
  // earlier, so it flushes first in the same commit) can call clearEditMode()
  // when exiting a stale edit session on this same navigation. That store
  // write lands after this effect's closure already captured the OLD
  // (still-true) isEditMode, so without isEditMode in deps this effect would
  // bail out on the stale value and never get a second chance — since
  // `profile`/`location.key` don't change again, the prefill would be lost
  // for that navigation. Listing isEditMode here lets the effect re-run once
  // it flips to false.
  useEffect(() => {
    if (prefilledRef.current || isEditMode) return;
    const query = new URLSearchParams(location.search);
    const queryName = query.get('name');
    const { name, markOnboarded } = resolveInitialName({
      queryName,
      displayName: profile?.display_name,
      hasOnboarded: hasCreateOnboarded(),
    });
    if (name && !wordInput) {
      prefilledRef.current = true;
      setWordInput(name);
      nameInputRef.current?.focus();
      // Only consume the one-time onboarding gate when the prefill actually
      // applied — otherwise a user who typed before `profile` loaded would
      // permanently lose their first-visit display-name prefill even though
      // it never ran.
      if (markOnboarded) markCreateOnboarded();
      // Arriving from the home page: show the flower they already grew there.
      if (queryName && query.get('grow') === '1') void handleGenerate(name);
    } else if (queryName) {
      // A deep-link with a blank/edit state still counts as handled.
      prefilledRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, location.key, isEditMode]);

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
    const blob = await captureFlowerPng({ caption: true });
    if (!blob) {
      toast.error("Couldn't draw the picture. Check that the flower is showing, then try again.");
      return;
    }
    triggerDownload(blob, 'png');
  };

  const handleDownloadGif = async () => {
    if (isEncodingGif) return; // re-entry guard, matches other handlers
    setIsEncodingGif(true);
    const toastId = toast.loading('Rendering GIF…');
    try {
      const blob = await captureFlowerGif({ frames: 36, size: 512, background: 'dark', caption: true });
      if (!blob) {
        toast.error("Couldn't draw the GIF. Check that the flower is showing, then try again.", { id: toastId });
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
      toast.error('Grow a flower first, then share it.');
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
      const { BrowserProvider } = await import('ethers');
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
      toast.success(`${word} is growing.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend is offline or generation failed';
      toast.error(message);
    }
  };

  const handleGenerate = async (overrideWord?: string) => {
    if (isGenerating) return;
    const word = (overrideWord ?? wordInput).trim();
    if (!word) {
      toast.error('Type a name first.');
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
      toast.error('Grow a flower first, then save it.');
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
      toast.error('Grow a flower first.');
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
      const { BrowserProvider, Contract } = await import('ethers');
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

      const contract = new Contract(prepared.contractAddress, MINT_ABI, signer);

      const { voucher, signature, value } = buildMintCall(prepared);
      const tx = await contract.mint(voucher, signature, { value });
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
      toast.error(mintErrorMessage(message));
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
                ref={nameInputRef}
                type="text"
                value={wordInput}
                onChange={(e) => handleWordInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isGenerating) void handleGenerate();
                }}
                placeholder="Enter a name or phrase..."
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full min-w-0"
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
                aria-label="Generate"
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

          {/* Variations: deterministic "more like this" siblings of the current
              name. Clicking reuses the existing guarded handleGenerate — in edit
              mode it routes through the regenerate-warning dialog; in create
              mode shouldWarnRegenerate returns false so it just generates. */}
          {variations.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 pb-1 flex-wrap">
              <span className="text-xs text-muted-foreground">More like this:</span>
              {variations.map((v) => (
                <button
                  key={v.key}
                  onClick={() => { setWordInput(v.word); void handleGenerate(v.word); }}
                  disabled={isGenerating}
                  title={v.word}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: v.gradient }} />
                  <span className="capitalize">{kindOf(v.word)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Recent generation words — refill only (does NOT auto-generate). */}
          {!isEditMode && recentNames.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 pb-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">Recent:</span>
              {recentNames.map((n) => (
                <button
                  key={n}
                  onClick={() => { setWordInput(n); nameInputRef.current?.focus(); }}
                  title={`Reuse "${n}"`}
                  className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors motion-reduce:transition-none truncate max-w-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* Row 2: actions, once there is a flower to act on */}
          {params.flowerId && <div className="flex items-center gap-1.5 px-3 pb-2 pt-0.5 flex-wrap">
            {MINT_OPEN && <button
              onClick={() => void handleConnectWallet()}
              title="Connect wallet"
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              <Wallet className="w-3 h-3 shrink-0" />
              <span className="hidden md:inline">
                {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Wallet'}
              </span>
            </button>}

            <button
              onClick={() => void handleSave()}
              disabled={isSaving || isGenerating}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
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
                    PNG is a still by day. GIF turns slowly with the lights off — larger file, a few seconds to encode.
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  <DropdownMenuItem onSelect={() => void handleDownloadPng()} className="text-xs gap-2">
                    <Image className="w-3.5 h-3.5" /> PNG · picture
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); void handleDownloadGif(); }}
                    disabled={isEncodingGif}
                    className="text-xs gap-2"
                  >
                    <Film className="w-3.5 h-3.5" /> GIF · slowly turning
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
              disabled={isMinting || !MINT_OPEN}
              title={MINT_OPEN ? undefined : 'Minting is coming soon'}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              <Gem className="w-3 h-3" />
              <span className="hidden sm:inline">{!MINT_OPEN ? 'Mint soon' : isMinting ? 'Minting...' : 'Mint NFT'}</span>
            </button>
          </div>}

          {isEditMode && (
            <div className="px-3 py-1 border-t border-border bg-amber-500/15 flex items-center gap-2">
              <Pencil className="w-3 h-3 text-amber-800 dark:text-amber-300 shrink-0" />
              <span className="text-xs text-amber-900 dark:text-amber-200 truncate">
                Editing: <span className="font-semibold">{title}</span>
                <span className="opacity-70 ml-2">name: {generationWord}</span>
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

        <div className="flex-1 relative min-h-0">
          <BloomView name={generationWord} followTheme />
        </div>
      </div>
    </div>
  );
}
