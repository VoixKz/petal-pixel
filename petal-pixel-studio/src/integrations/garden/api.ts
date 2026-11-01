import { create } from "@bufbuild/protobuf";
import {
  DeleteGardenFlowerRequestSchema,
  ListGardenRequestSchema,
  UpdateGardenFlowerRequestSchema,
  UpsertGardenFlowerRequestSchema,
} from "@/gen/flower/v1/service_pb";
import { flowerClient } from "@/integrations/flowerBackend/client";

export { getSignedInUserId } from "@/integrations/auth/oidc";

export interface GardenRow {
  flowerId: string;
  savedName: string;
  generationWord: string;
  params: unknown;
  createdAt: string;
  isMinted: boolean;
  txHash: string;
  tokenUri: string;
}

export async function listGarden(): Promise<GardenRow[]> {
  const { flowers } = await flowerClient.listGarden(create(ListGardenRequestSchema, {}));
  return flowers.flatMap((f) => {
    try {
      return [
        {
          flowerId: f.flowerId,
          savedName: f.savedName,
          generationWord: f.generationWord,
          params: JSON.parse(f.paramsJson) as unknown,
          createdAt: f.createdAt,
          isMinted: f.isMinted,
          txHash: f.txHash,
          tokenUri: f.tokenUri,
        },
      ];
    } catch {
      console.error("listGarden: unreadable params for", f.flowerId);
      return [];
    }
  });
}

export async function upsertGardenFlower(flower: {
  flowerId: string;
  savedName: string;
  generationWord: string;
  params: unknown;
}): Promise<void> {
  await flowerClient.upsertGardenFlower(
    create(UpsertGardenFlowerRequestSchema, {
      flowerId: flower.flowerId,
      savedName: flower.savedName,
      generationWord: flower.generationWord,
      paramsJson: JSON.stringify(flower.params),
    }),
  );
}

export async function updateGardenFlower(
  flowerId: string,
  fields: { savedName?: string; generationWord?: string; params?: unknown },
): Promise<void> {
  await flowerClient.updateGardenFlower(
    create(UpdateGardenFlowerRequestSchema, {
      flowerId,
      ...(fields.savedName !== undefined ? { savedName: fields.savedName } : {}),
      ...(fields.generationWord !== undefined ? { generationWord: fields.generationWord } : {}),
      ...(fields.params !== undefined ? { paramsJson: JSON.stringify(fields.params) } : {}),
    }),
  );
}

export async function deleteGardenFlower(flowerId: string): Promise<void> {
  await flowerClient.deleteGardenFlower(create(DeleteGardenFlowerRequestSchema, { flowerId }));
}
