import { id } from 'ethers';

/** keccak256("Transfer(address,address,uint256)") — shared by ERC-20 and ERC-721. */
export const TRANSFER_TOPIC = id('Transfer(address,address,uint256)');

/** Minimal structural view of an ethers v6 receipt Log — keeps tests ethers-free. */
export interface ReceiptLog {
  address: string;
  topics: readonly string[];
}

/**
 * Parses the ERC-721 Transfer event out of a mint tx receipt and returns the
 * minted tokenId, or null when no matching event is found. ERC-721 Transfer has
 * all 3 args indexed (4 topics total); tokenId is topics[3]. ERC-20 Transfer
 * only has 3 topics, so requiring length 4 filters those out.
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
    return Number(BigInt(log.topics[3]));
  }
  return null;
}
