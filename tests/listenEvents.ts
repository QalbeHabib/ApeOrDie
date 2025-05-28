import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ApeOrDie } from "../types/types/ApeOrDie";
import * as web3 from "@solana/web3.js";

describe("listen-events", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ApeOrDie as Program<ApeOrDie>;
  let subscriptionId: number;

  before(() => {
    console.log(`Program ID: ${program.programId.toBase58()}`);
  });

  after(() => {
    if (subscriptionId) {
      provider.connection.removeProgramAccountChangeListener(subscriptionId);
      console.log("Subscription cleaned up");
    }
  });

  it("Listens for CompleteEvent", async () => {
    console.log("Starting event listener...");

    // Create a promise that will resolve when we receive an event
    const eventPromise = new Promise<void>((resolve) => {
      subscriptionId = provider.connection.onProgramAccountChange(
        program.programId,
        (accountInfo: web3.KeyedAccountInfo, context: web3.Context) => {
          try {
            const event = program.coder.events.decode(
              accountInfo.accountInfo.data.toString()
            );

            if (event && event.name === "CompleteEvent") {
              console.log("\n=== CompleteEvent Received ===");
              console.log("Event data:", event.data);
              console.log("Slot:", context.slot);
              console.log("Account:", accountInfo.accountId.toBase58());
              console.log("===========================\n");
              resolve();
            }
          } catch (error) {
            console.error("Error decoding event:", error);
          }
        },
        "confirmed"
      );
    });

    // Set a timeout to stop listening after 5 minutes
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Timeout: No event received after 5 minutes"));
      }, 300000);
    });

    try {
      await Promise.race([eventPromise, timeoutPromise]);
    } catch (error: any) {
      console.error(error?.message || "An error occurred");
    } finally {
      if (subscriptionId) {
        provider.connection.removeProgramAccountChangeListener(subscriptionId);
        console.log("Event listener stopped");
      }
    }
  });
});
