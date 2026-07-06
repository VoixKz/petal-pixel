import { describe, expect, it } from "vitest";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { PrepareMintRequestSchema } from "@/gen/flower/v1/service_pb";

describe("PrepareMintRequest image_png", () => {
  it("carries imagePng bytes through the binary wire format", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const msg = create(PrepareMintRequestSchema, {
      flowerId: "f_abc123",
      walletAddress: "0x0000000000000000000000000000000000000001",
      imagePng: png,
    });
    const decoded = fromBinary(PrepareMintRequestSchema, toBinary(PrepareMintRequestSchema, msg));
    expect(Array.from(decoded.imagePng)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(decoded.flowerId).toBe("f_abc123");
  });
});
