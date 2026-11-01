import { describe, it, expect } from "vitest";
import { Interface } from "ethers";
import { MINT_ABI, buildMintCall, type PreparedMint } from "./mintVoucher";

const prepared: PreparedMint = {
  mintTo: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  mintTokenUri: "http://localhost:9000/flower/metadata/flw_test.json",
  tokenUri: "http://localhost:9000/flower/metadata/other.json",
  voucherFlowerId: "0xde7458b8f4958d05b7e614057c4bf7a98eabd210e8a04daf77138f40703cdac0",
  voucherPriceWei: "1000000000000000",
  voucherDeadline: 1893456000n,
  voucherSignature: `0x${"ab".repeat(65)}`,
};

describe("MINT_ABI", () => {
  it("matches the contract's mint signature", () => {
    const fn = new Interface(MINT_ABI).getFunction("mint");

    expect(fn?.format("sighash")).toBe("mint((bytes32,address,string,uint256,uint256),bytes)");
    expect(fn?.payable).toBe(true);
  });

  it.each(["AlreadyMinted", "InvalidSignature", "VoucherExpired", "WrongPayment"])(
    "can decode the contract's %s error",
    (name) => {
      expect(new Interface(MINT_ABI).getError(name)).not.toBeNull();
    },
  );
});

describe("buildMintCall", () => {
  it("passes the signed fields through unchanged", () => {
    const call = buildMintCall(prepared);

    expect(call.voucher).toEqual({
      flowerId: prepared.voucherFlowerId,
      to: prepared.mintTo,
      tokenURI: prepared.mintTokenUri,
      price: 1000000000000000n,
      deadline: 1893456000n,
    });
    expect(call.signature).toBe(prepared.voucherSignature);
  });

  it("pays exactly the voucher price", () => {
    expect(buildMintCall(prepared).value).toBe(1000000000000000n);
  });

  it("encodes into calldata for the contract", () => {
    const { voucher, signature } = buildMintCall(prepared);

    const data = new Interface(MINT_ABI).encodeFunctionData("mint", [voucher, signature]);

    expect(data.startsWith("0x")).toBe(true);
    expect(data.length).toBeGreaterThan(10);
  });

  it("refuses to mint without a voucher", () => {
    expect(() => buildMintCall({ ...prepared, voucherSignature: "" })).toThrow(
      "Backend did not return a mint voucher",
    );
  });
});
