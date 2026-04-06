// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Script.sol";
import "../contracts/FlowerNFT.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        FlowerNFT nft = new FlowerNFT(msg.sender);
        vm.stopBroadcast();
    }
}