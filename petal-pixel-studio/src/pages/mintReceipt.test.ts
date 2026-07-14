import { describe, it, expect } from 'vitest';
import { extractMintedTokenId, TRANSFER_TOPIC } from './mintReceipt';

const CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ZERO_WORD = '0x' + '0'.repeat(64);
const RECIPIENT_WORD = '0x' + 'f39fd6e51aad88f6f4ce6ab8827279cfffb92266'.padStart(64, '0');

function transferLog(tokenId: number, address = CONTRACT) {
  return {
    address,
    topics: [
      TRANSFER_TOPIC,
      ZERO_WORD, // from = 0x0 on a mint
      RECIPIENT_WORD,
      '0x' + tokenId.toString(16).padStart(64, '0'),
    ],
  };
}

describe('extractMintedTokenId', () => {
  it('uses the canonical ERC-721 Transfer topic hash', () => {
    // keccak256("Transfer(address,address,uint256)")
    expect(TRANSFER_TOPIC).toBe(
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    );
  });

  it('extracts tokenId from the third indexed topic of a matching Transfer log', () => {
    expect(extractMintedTokenId([transferLog(7)], CONTRACT)).toBe(7);
  });

  it('matches the contract address case-insensitively', () => {
    expect(extractMintedTokenId([transferLog(3)], CONTRACT.toLowerCase())).toBe(3);
  });

  it('ignores Transfer logs emitted by other contracts', () => {
    const other = transferLog(9, '0x0000000000000000000000000000000000000001');
    expect(extractMintedTokenId([other], CONTRACT)).toBeNull();
  });

  it('ignores ERC-20-shaped Transfer logs (only 3 topics — tokenId not indexed)', () => {
    const erc20 = { address: CONTRACT, topics: [TRANSFER_TOPIC, ZERO_WORD, RECIPIENT_WORD] };
    expect(extractMintedTokenId([erc20], CONTRACT)).toBeNull();
  });

  it('ignores a non-mint Transfer (from != 0x0, e.g. a resale)', () => {
    // Same contract + 4 topics, but `from` (topics[1]) is a real address, not
    // the zero word — this is a transfer/resale, not a mint, and must be skipped.
    const resale = {
      address: CONTRACT,
      topics: [TRANSFER_TOPIC, RECIPIENT_WORD, RECIPIENT_WORD, '0x' + (5).toString(16).padStart(64, '0')],
    };
    expect(extractMintedTokenId([resale], CONTRACT)).toBeNull();
  });

  it('returns null for an empty log list', () => {
    expect(extractMintedTokenId([], CONTRACT)).toBeNull();
  });
});
