import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ApeOrDie } from "../types/types/ApeOrDie.js";
import * as web3 from "@solana/web3.js";
import { config } from "dotenv";

config({ path: "../../.env" });

async function main() {
  // Set up the connection to Solana
  const connection = new web3.Connection(
    process.env.ENV === "main"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com",
    "confirmed"
  );

  // Set up the provider
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(web3.Keypair.generate()), // We don't need a wallet for just reading events
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  // Get the program
  const program = anchor.workspace.ApeOrDie as Program<ApeOrDie>;

  // Subscribe to program events
  const subscriptionId = connection.onProgramAccountChange(
    program.programId,
    async (accountInfo, context) => {
      try {
        // Decode the event data
        const event = program.coder.events.decode(
          accountInfo.accountInfo.data.toString()
        );

        // Check if it's a CompleteEvent
        if (event && event.name === "CompleteEvent") {
          console.log("CompleteEvent received:");
          console.log("Event data:", event.data);
          console.log("Slot:", context.slot);
          console.log("Account:", accountInfo.accountId.toBase58());
        }
      } catch (error) {
        console.error("Error decoding event:", error);
      }
    },
    "confirmed"
  );

  console.log(
    `Listening for CompleteEvent on program: ${program.programId.toBase58()}`
  );
  console.log("Press Ctrl+C to stop listening");

  // Keep the script running
  process.on("SIGINT", () => {
    console.log("Stopping event listener...");
    connection.removeProgramAccountChangeListener(subscriptionId);
    process.exit(0);
  });
}

main().catch(console.error);
