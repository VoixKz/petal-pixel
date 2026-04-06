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

export async function prepareMintViaGrpc(flowerId: string, walletAddress: string) {
  return client.prepareMint(create(PrepareMintRequestSchema, { flowerId, walletAddress }));
}

export async function confirmMintViaGrpc(flowerId: string, txHash: string) {
  return client.confirmMint(create(ConfirmMintRequestSchema, { flowerId, txHash }));
}

export interface FlowerListItem {
  flower_id: string;
  person_name: string;
  params: {
    algo_version: string;
    schema_version: string;
    seed: number;
    petal_count: number;
    petal_length: number;
    petal_width: number;
    curvature: number;
    stem_height: number;
    hue: number;
  };
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

export async function checkFlowerBackendHealth() {
  const response = await fetch(`${flowerBackendBaseUrl}/healthz`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  const payload = await response.json() as { status?: string };
  return payload.status === "ok";
}
