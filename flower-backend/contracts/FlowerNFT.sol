// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract FlowerNFT is ERC721URIStorage, Ownable {
    uint256 public nextTokenId;

    constructor(
        address initialOwner
    ) ERC721('FlowerNFT', 'FLOWER') Ownable(initialOwner) {}

    function mint(
        address to,
        string calldata tokenURI
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        return tokenId;
    }
}
