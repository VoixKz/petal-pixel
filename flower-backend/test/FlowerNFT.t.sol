// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {FlowerNFT} from "../contracts/FlowerNFT.sol";

// Tries to mint the same flower again from inside the safe-mint callback.
contract ReentrantBuyer is IERC721Receiver {
    FlowerNFT private immutable nft;
    FlowerNFT.Voucher private voucher;
    bytes private signature;
    bool public secondMintReverted;

    constructor(FlowerNFT nft_) {
        nft = nft_;
    }

    function start(FlowerNFT.Voucher calldata v, bytes calldata sig) external {
        voucher = v;
        signature = sig;
        nft.mint(v, sig);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        try nft.mint(voucher, signature) {} catch {
            secondMintReverted = true;
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract FlowerNFTTest is Test {
    event Minted(bytes32 indexed flowerId, address indexed to, uint256 indexed tokenId);

    uint256 private constant SIGNER_KEY = 0xA11CE;
    uint256 private constant STRANGER_KEY = 0xB0B;
    bytes32 private constant FLOWER = keccak256("flw_test");
    string private constant URI = "http://files/metadata.json";

    FlowerNFT private nft;
    address private owner = makeAddr("owner");
    address private buyer = makeAddr("buyer");
    address private other = makeAddr("other");

    function setUp() public {
        nft = new FlowerNFT(owner, vm.addr(SIGNER_KEY));
        vm.deal(buyer, 10 ether);
        vm.deal(other, 10 ether);
    }

    function voucher(uint256 price) private view returns (FlowerNFT.Voucher memory) {
        return FlowerNFT.Voucher({flowerId: FLOWER, to: buyer, tokenURI: URI, price: price, deadline: block.timestamp + 1 hours});
    }

    function signWith(FlowerNFT target, FlowerNFT.Voucher memory v, uint256 key) private view returns (bytes memory) {
        (uint8 recovery, bytes32 r, bytes32 s) = vm.sign(key, target.hashVoucher(v));
        return abi.encodePacked(r, s, recovery);
    }

    function sign(FlowerNFT.Voucher memory v) private view returns (bytes memory) {
        return signWith(nft, v, SIGNER_KEY);
    }

    function test_MintsToVoucherRecipient() public {
        FlowerNFT.Voucher memory v = voucher(0.01 ether);

        vm.expectEmit(address(nft));
        emit Minted(FLOWER, buyer, 0);
        vm.prank(buyer);
        uint256 tokenId = nft.mint{value: 0.01 ether}(v, sign(v));

        assertEq(tokenId, 0);
        assertEq(nft.ownerOf(0), buyer);
        assertEq(nft.tokenURI(0), URI);
        assertTrue(nft.minted(FLOWER));
        assertEq(address(nft).balance, 0.01 ether);
    }

    function test_AnyoneMaySubmitButTokenGoesToRecipient() public {
        FlowerNFT.Voucher memory v = voucher(0);

        vm.prank(other);
        nft.mint(v, sign(v));

        assertEq(nft.ownerOf(0), buyer);
    }

    function test_RevertsWhenSignedByStranger() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory forged = signWith(nft, v, STRANGER_KEY);

        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        nft.mint(v, forged);
    }

    function test_RevertsWhenRecipientChanged() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory signature = sign(v);
        v.to = other;

        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        nft.mint(v, signature);
    }

    function test_RevertsWhenTokenUriChanged() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory signature = sign(v);
        v.tokenURI = "http://evil/metadata.json";

        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        nft.mint(v, signature);
    }

    function test_RevertsWhenPriceLowered() public {
        FlowerNFT.Voucher memory v = voucher(1 ether);
        bytes memory signature = sign(v);
        v.price = 0;

        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        nft.mint(v, signature);
    }

    function test_RevertsWhenFlowerChanged() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory signature = sign(v);
        v.flowerId = keccak256("flw_other");

        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        nft.mint(v, signature);
    }

    function test_RevertsOnSecondMintOfSameFlower() public {
        FlowerNFT.Voucher memory first = voucher(0);
        nft.mint(first, sign(first));

        FlowerNFT.Voucher memory second = voucher(0);
        second.to = other;
        second.tokenURI = "http://files/other.json";
        bytes memory signature = sign(second);

        vm.expectRevert(FlowerNFT.AlreadyMinted.selector);
        nft.mint(second, signature);
    }

    function test_ReentrantReceiverCannotMintTwice() public {
        ReentrantBuyer attacker = new ReentrantBuyer(nft);
        FlowerNFT.Voucher memory v = voucher(0);
        v.to = address(attacker);
        bytes memory signature = sign(v);

        attacker.start(v, signature);

        assertTrue(attacker.secondMintReverted());
        assertEq(nft.balanceOf(address(attacker)), 1);
        assertEq(nft.nextTokenId(), 1);
    }

    function test_AcceptsVoucherAtDeadline() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory signature = sign(v);

        vm.warp(v.deadline);
        nft.mint(v, signature);

        assertEq(nft.ownerOf(0), buyer);
    }

    function test_RevertsAfterDeadline() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory signature = sign(v);

        vm.warp(v.deadline + 1);
        vm.expectRevert(FlowerNFT.VoucherExpired.selector);
        nft.mint(v, signature);
    }

    function test_VoucherForOneContractFailsOnAnother() public {
        FlowerNFT twin = new FlowerNFT(owner, vm.addr(SIGNER_KEY));
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory signature = sign(v);

        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        twin.mint(v, signature);
    }

    function test_VoucherFailsOnAnotherChain() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory signature = sign(v);

        vm.chainId(block.chainid + 1);
        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        nft.mint(v, signature);
    }

    // Written out by hand so a change to the type string or domain fails here,
    // and so the Go signer has a definition to match.
    function test_DigestFollowsEip712() public view {
        FlowerNFT.Voucher memory v = voucher(5);
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Petal Pixel"),
                keccak256("2"),
                block.chainid,
                address(nft)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Voucher(bytes32 flowerId,address to,string tokenURI,uint256 price,uint256 deadline)"),
                v.flowerId,
                v.to,
                keccak256(bytes(v.tokenURI)),
                v.price,
                v.deadline
            )
        );

        assertEq(nft.hashVoucher(v), keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
    }

    // Shared with internal/voucher/voucher_test.go, so Go and Solidity cannot drift.
    function test_VectorSharedWithGoSigner() public {
        uint256 anvilAccount1Key = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        address firstAnvilDeployment = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
        vm.chainId(1337);
        deployCodeTo("FlowerNFT.sol:FlowerNFT", abi.encode(owner, vm.addr(anvilAccount1Key)), firstAnvilDeployment);
        FlowerNFT target = FlowerNFT(firstAnvilDeployment);
        FlowerNFT.Voucher memory v = FlowerNFT.Voucher({
            flowerId: keccak256("flw_test"),
            to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            tokenURI: "http://localhost:9000/flower/metadata/flw_test.json",
            price: 1000000000000000,
            deadline: 1893456000
        });

        assertEq(target.hashVoucher(v), 0xde7458b8f4958d05b7e614057c4bf7a98eabd210e8a04daf77138f40703cdac0);

        target.mint{value: v.price}(
            v,
            hex"0bf00566061aafd1554c621000b5bbc2fd724977fc98eeb99b7765b3ae95fe7966ee8aeeceee7eaf96456b91a5d31d54be7218f58e67bac8a06e7666f79dc8d41c"
        );
        assertEq(target.ownerOf(0), v.to);
    }

    function test_RevertsWhenUnderpaid() public {
        FlowerNFT.Voucher memory v = voucher(1 ether);
        bytes memory signature = sign(v);

        vm.prank(buyer);
        vm.expectRevert(FlowerNFT.WrongPayment.selector);
        nft.mint{value: 1 ether - 1}(v, signature);
    }

    function testFuzz_OnlyExactPaymentMints(uint96 price, uint96 paid) public {
        vm.assume(paid != price);
        vm.deal(buyer, uint256(paid) + uint256(price));
        FlowerNFT.Voucher memory v = voucher(price);
        bytes memory signature = sign(v);

        vm.prank(buyer);
        vm.expectRevert(FlowerNFT.WrongPayment.selector);
        nft.mint{value: paid}(v, signature);

        vm.prank(buyer);
        nft.mint{value: price}(v, signature);
        assertEq(nft.ownerOf(0), buyer);
    }

    function testFuzz_DeadlineIsEnforced(uint32 lifetime, uint32 wait) public {
        FlowerNFT.Voucher memory v = voucher(0);
        v.deadline = block.timestamp + lifetime;
        bytes memory signature = sign(v);

        vm.warp(block.timestamp + uint256(wait));
        if (uint256(wait) > lifetime) vm.expectRevert(FlowerNFT.VoucherExpired.selector);
        nft.mint(v, signature);
    }

    function test_OwnerWithdrawsBalance() public {
        FlowerNFT.Voucher memory v = voucher(2 ether);
        vm.prank(buyer);
        nft.mint{value: 2 ether}(v, sign(v));

        vm.prank(owner);
        nft.withdraw(payable(other));

        assertEq(other.balance, 12 ether);
        assertEq(address(nft).balance, 0);
    }

    function test_StrangerCannotWithdraw() public {
        vm.prank(other);
        vm.expectRevert();
        nft.withdraw(payable(other));
    }

    function test_RotatingSignerRetiresOldVouchers() public {
        FlowerNFT.Voucher memory v = voucher(0);
        bytes memory oldSignature = sign(v);

        vm.prank(owner);
        nft.setVoucherSigner(vm.addr(STRANGER_KEY));

        vm.expectRevert(FlowerNFT.InvalidSignature.selector);
        nft.mint(v, oldSignature);

        nft.mint(v, signWith(nft, v, STRANGER_KEY));
        assertEq(nft.ownerOf(0), buyer);
    }

    function test_StrangerCannotRotateSigner() public {
        vm.prank(other);
        vm.expectRevert();
        nft.setVoucherSigner(other);
    }
}
