// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

// Mints only with a voucher signed by the backend, and at most once per flower.
contract FlowerNFT is ERC721URIStorage, Ownable, EIP712 {
    struct Voucher {
        bytes32 flowerId;
        address to;
        string tokenURI;
        uint256 price;
        uint256 deadline;
    }

    bytes32 private constant VOUCHER_TYPEHASH =
        keccak256('Voucher(bytes32 flowerId,address to,string tokenURI,uint256 price,uint256 deadline)');

    error AlreadyMinted();
    error InvalidSignature();
    error VoucherExpired();
    error WithdrawFailed();
    error WrongPayment();

    event Minted(bytes32 indexed flowerId, address indexed to, uint256 indexed tokenId);
    event VoucherSignerChanged(address indexed signer);

    uint256 public nextTokenId;
    address public voucherSigner;
    mapping(bytes32 flowerId => bool) public minted;

    constructor(
        address initialOwner,
        address signer
    ) ERC721('FlowerNFT', 'FLOWER') Ownable(initialOwner) EIP712('Petal Pixel', '2') {
        voucherSigner = signer;
    }

    function hashVoucher(Voucher calldata v) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(abi.encode(VOUCHER_TYPEHASH, v.flowerId, v.to, keccak256(bytes(v.tokenURI)), v.price, v.deadline))
            );
    }

    function mint(Voucher calldata v, bytes calldata signature) external payable returns (uint256) {
        if (block.timestamp > v.deadline) revert VoucherExpired();
        if (minted[v.flowerId]) revert AlreadyMinted();
        if (ECDSA.recover(hashVoucher(v), signature) != voucherSigner) revert InvalidSignature();
        if (msg.value != v.price) revert WrongPayment();

        // Set before _safeMint: it calls the recipient, which could re-enter.
        minted[v.flowerId] = true;
        uint256 tokenId = nextTokenId++;
        _safeMint(v.to, tokenId);
        _setTokenURI(tokenId, v.tokenURI);
        emit Minted(v.flowerId, v.to, tokenId);
        return tokenId;
    }

    function setVoucherSigner(address signer) external onlyOwner {
        voucherSigner = signer;
        emit VoucherSignerChanged(signer);
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}('');
        if (!ok) revert WithdrawFailed();
    }
}
