const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [admin, user1] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", admin.address);

  // Deploy TIXCOIN
  const TIXCOIN = await hre.ethers.getContractFactory("TIXCOIN");
  const tixcoin = await TIXCOIN.deploy(admin.address);
  await tixcoin.waitForDeployment();
  console.log(`TIXCOIN (ERC-20) deployed to: ${tixcoin.target}`);

  // Deploy TicketBooking
  const TicketBooking = await hre.ethers.getContractFactory("TicketBooking");
  const ticketBooking = await TicketBooking.deploy(tixcoin.target);
  await ticketBooking.waitForDeployment();
  console.log(`TicketBooking (ERC-721) deployed to: ${ticketBooking.target}`);

  // Fund a test user
  const amount = hre.ethers.parseUnits("5000", 18);
  await tixcoin.connect(admin).transfer(user1.address, amount);
  console.log(`Transferred 5,000 TIX from Admin to ${user1.address}`);

  // Create config file for frontend
  const contractAddresses = {
    ticketBooking: ticketBooking.target,
    tixcoin: tixcoin.target,
  };

  fs.writeFileSync(
    "./frontend/src/contract-config.json",
    JSON.stringify(contractAddresses)
  );
  console.log("Contract addresses saved to frontend/src/contract-config.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});