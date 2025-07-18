// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TIXCOIN is ERC20 {
    constructor(address initialOwner) ERC20("TIXCOIN", "TIX") {
        _mint(initialOwner, 1000000 * 10 ** decimals());
    }
}