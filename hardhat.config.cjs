/**
 * Hardhat drives the on-chain delivery suite only: deploying the projection
 * contract, submitting real transactions against it, and verifying the events
 * they emit. The rest of the Kit runs on node:test with no build step, and is
 * untouched by this configuration.
 */
require("@nomicfoundation/hardhat-ethers");

module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
  paths: { sources: "contracts", tests: "tests/onchain", cache: ".hardhat/cache", artifacts: ".hardhat/artifacts" },
};
