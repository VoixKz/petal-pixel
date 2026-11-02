/** ABI of FlowerNFT.mint. The errors are listed so ethers can name a revert. */
export const MINT_ABI = [
  'function mint((bytes32 flowerId, address to, string tokenURI, uint256 price, uint256 deadline) v, bytes signature) payable returns (uint256)',
  'error AlreadyMinted()',
  'error InvalidSignature()',
  'error VoucherExpired()',
  'error WrongPayment()',
];

/** The PrepareMint response fields a mint needs. */
export interface PreparedMint {
  mintTo: string;
  mintTokenUri: string;
  tokenUri: string;
  voucherFlowerId: string;
  voucherPriceWei: string;
  voucherDeadline: bigint;
  voucherSignature: string;
}

/** Builds the mint arguments. Every field must stay exactly as the backend signed it. */
export function buildMintCall(prepared: PreparedMint) {
  if (!prepared.voucherSignature) {
    throw new Error('Backend did not return a mint voucher');
  }
  const price = BigInt(prepared.voucherPriceWei);
  return {
    voucher: {
      flowerId: prepared.voucherFlowerId,
      to: prepared.mintTo,
      tokenURI: prepared.mintTokenUri || prepared.tokenUri,
      price,
      deadline: prepared.voucherDeadline,
    },
    signature: prepared.voucherSignature,
    value: price,
  };
}

/** Off on the public site until it has a real network and public file storage. */
export const MINT_OPEN = import.meta.env.VITE_MINT_OPEN !== 'false';
