// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/FlowerNFT.sol";

contract Deploy is Script {
    // Anvil account 1. The key is public, so this default is for the local chain only.
    address private constant LOCAL_VOUCHER_SIGNER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        address signer = vm.envOr("VOUCHER_SIGNER", LOCAL_VOUCHER_SIGNER);
        vm.startBroadcast();
        new FlowerNFT(msg.sender, signer);
        vm.stopBroadcast();
    }
}
