import { id } from 'ethers';

/** keccak256("Transfer(address,address,uint256)") — shared by ERC-20 and ERC-721. */
export const TRANSFER_TOPIC = id('Transfer(address,address,uint256)');

/** 32-byte zero word — the `from` topic of a mint Transfer (0x0 → recipient). */
export const ZERO_ADDRESS_TOPIC = '0x' + '0'.repeat(64);

/** Minimal structural view of an ethers v6 receipt Log — keeps tests ethers-free. */
export interface ReceiptLog {
  address: string;
  topics: readonly string[];
}

/**
 * Parses the ERC-721 *mint* Transfer event out of a tx receipt and returns the
 * minted tokenId, or null when no matching mint event is found. ERC-721 Transfer
 * has all 3 args indexed (4 topics total); tokenId is topics[3]. ERC-20 Transfer
 * only has 3 topics, so requiring length 4 filters those out. A MINT is a
 * Transfer whose `from` (topics[1]) is the zero address — requiring that rejects
 * ordinary resale/transfer Transfer logs from the same contract in the receipt.
 *
 * Returns `number | null` by binding decision (plan D §"BINDING CONFLICT
 * RESOLUTIONS"): the return type stays `number` so it does not ripple into
 * CreateFlower.tsx's MintResult (owned by another task). tokenIds start at 0 and
 * are Number-safe below 2^53 — well beyond this demo contract's supply. Should a
 * tokenId ever exceed Number.MAX_SAFE_INTEGER the low digits would be lost here;
 * switch to a decimal-string return (and widen MintResult) before that is a risk.
 */
export function extractMintedTokenId(
  logs: readonly ReceiptLog[],
  contractAddress: string,
): number | null {
  const wanted = contractAddress.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== wanted) continue;
    if (log.topics.length !== 4) continue;
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    if (log.topics[1].toLowerCase() !== ZERO_ADDRESS_TOPIC) continue; // mint only: from == 0x0
    return Number(BigInt(log.topics[3]));
  }
  return null;
}
