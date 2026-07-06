import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { create } from "@bufbuild/protobuf";
import { FlowerService } from "@/gen/flower/v1/service_pb";
import {
  ConfirmMintRequestSchema,
  CreateFlowerRequestSchema,
  GetFlowerRequestSchema,
  PrepareMintRequestSchema,
} from "@/gen/flower/v1/service_pb";

export const flowerBackendBaseUrl = import.meta.env.VITE_FLOWER_BACKEND_URL || "http://localhost:50051";

const transport = createGrpcWebTransport({
  baseUrl: flowerBackendBaseUrl,
  useBinaryFormat: true,
});

const client = createClient(FlowerService, transport);

export async function createFlowerViaGrpc(personName: string) {
  return client.createFlower(create(CreateFlowerRequestSchema, { personName }));
}

export async function getFlowerViaGrpc(flowerId: string) {
  return client.getFlower(create(GetFlowerRequestSchema, { flowerId }));
}

export async function prepareMintViaGrpc(
  flowerId: string,
  walletAddress: string,
  imagePng?: Uint8Array,
) {
  return client.prepareMint(
    create(PrepareMintRequestSchema, {
      flowerId,
      walletAddress,
      ...(imagePng && imagePng.length > 0 ? { imagePng } : {}),
    }),
  );
}

export async function confirmMintViaGrpc(flowerId: string, txHash: string) {
  return client.confirmMint(create(ConfirmMintRequestSchema, { flowerId, txHash }));
}

/**
 * The persisted Go `flower.Params` JSON as it lands over HTTP (snake_case). The
 * v1 flat fields are always present; the v2 additive fields (family, palette,
 * and exactly one nested shape object) are present only for algo_version==='v2'
 * records. Kept intentionally permissive (all v2 fields optional, shape objects
 * typed as loose records) so the pure `mapBackendJsonToFlowerParams` mapper can
 * read a partial/legacy record without the type fighting it — the mapper itself
 * defends every field. Widen HERE before the mapper (binding contract).
 */
export interface FlowerParamsJson {
  algo_version: string;
  schema_version: string;
  seed: number;
  petal_count: number;
  petal_length: number;
  petal_width: number;
  curvature: number;
  stem_height: number;
  hue: number;

  // ── v2 additive (undefined on v1 records) ──────────────────────────────────
  family?: string;
  palette?: {
    id: string;
    stops: { position: number; hex: string; r?: number; g?: number; b?: number }[];
  };
  // Exactly one of these is set on a v2 record (the backend's proto `oneof
  // shape`). snake_case fields inside; the mapper reads them field-by-field.
  classic?: Record<string, number>;
  rose?: Record<string, number>;
  bloom?: Record<string, number>;
  sunflower?: Record<string, number>;
  rhodonea?: Record<string, number>;
  superformula?: Record<string, number>;
}

export interface FlowerListItem {
  flower_id: string;
  person_name: string;
  params: FlowerParamsJson;
  mint_status: '' | 'prepared' | 'confirmed';
  tx_hash: string;
  token_uri: string;
}

export async function fetchFlowersList(): Promise<FlowerListItem[]> {
  const res = await fetch(`${flowerBackendBaseUrl}/api/flowers`);
  if (!res.ok) throw new Error(`fetchFlowersList failed: ${res.status}`);
  const data = await res.json() as { flowers: FlowerListItem[] };
  return data.flowers ?? [];
}

/**
 * Fetch a single flower by id from the public HTTP endpoint. Used by the
 * logged-out share landing (no gRPC transport, no Supabase session). Accepts
 * both a bare flower object and a `{ flower: … }` envelope so it tolerates
 * either backend shape. Throws `Error('not_found')` on 404 so callers can show
 * a dedicated not-found state.
 */
export async function fetchFlowerById(flowerId: string): Promise<FlowerListItem> {
  const res = await fetch(`${flowerBackendBaseUrl}/api/flowers/${encodeURIComponent(flowerId)}`);
  if (res.status === 404) throw new Error('not_found');
  if (!res.ok) throw new Error(`fetchFlowerById failed: ${res.status}`);
  const data = await res.json() as FlowerListItem | { flower: FlowerListItem };
  return 'flower' in data && data.flower ? data.flower : (data as FlowerListItem);
}

/**
 * Upload a rendered PNG as the flower's public OG/preview image. Fire-and-forget
 * best-effort: returns `res.ok`, and SWALLOWS every network/parse error to
 * `false` so a failing preview endpoint can never reject and break the save
 * flow that calls it.
 */
export async function postFlowerPreview(flowerId: string, png: Blob): Promise<boolean> {
  try {
    const res = await fetch(
      `${flowerBackendBaseUrl}/api/flowers/${encodeURIComponent(flowerId)}/preview`,
      { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Build the shareable link for a flower. Points at the Go `/share/:id` OG route
 * (not the SPA origin) so crawlers get the OG preview HTML and humans are
 * redirected on to the SPA. Pure + tested: collapses a trailing slash in
 * `backendBaseUrl` and `encodeURIComponent`s the id.
 */
export function buildShareUrl(backendBaseUrl: string, flowerId: string): string {
  const base = backendBaseUrl.replace(/\/+$/, '');
  return `${base}/share/${encodeURIComponent(flowerId)}`;
}

export async function checkFlowerBackendHealth() {
  const response = await fetch(`${flowerBackendBaseUrl}/healthz`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  const payload = await response.json() as { status?: string };
  return payload.status === "ok";
}
