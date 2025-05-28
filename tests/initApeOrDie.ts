import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ApeOrDie } from "../target/types/ape_or_die";
import * as web3 from "@solana/web3.js";
import { BN } from "bn.js";
import { config } from "dotenv";

config({ path: "../../.env" });
console.log("ENV: ", process.env.ENV);

(async () => {
  console.log("Starting initApeOrDie");
  // Set up the Anchor provider
  const deployer = anchor.AnchorProvider.env();
  console.log("deployer: ", deployer);
  anchor.setProvider(deployer);
  // Instantiate the program using the IDL and programId
  const program = anchor.workspace.ApeOrDie as Program<ApeOrDie>;

  console.log("programId: ", program.programId.toBase58());

  // Derive the PDA for the "config" account
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  // Derive the PDA for the "global_vault" account
  const [globalVaultPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // The native mint account
  const nativeMint = new web3.PublicKey(
    "So11111111111111111111111111111111111111112"
  );
  const associatedTokenProgramId = new web3.PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
  );
  const tokenProgramId = new web3.PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );

  // Derive the Associated Token Account for the global_vault's WSOL
  const [globalWsolAccountPDA] = web3.PublicKey.findProgramAddressSync(
    [
      globalVaultPDA.toBuffer(),
      tokenProgramId.toBuffer(),
      nativeMint.toBuffer(),
    ],
    associatedTokenProgramId
  );

  console.log(
    "provider.wallet.publicKey: ",
    deployer.wallet.publicKey.toBase58()
  );

  // Define the configuration data
  const newConfig = {
    authority: deployer.wallet.publicKey,
    pendingAuthority: deployer.wallet.publicKey,
    teamWallet: deployer.wallet.publicKey,
    devWallet: deployer.wallet.publicKey,
    initBondingCurve: 100,
    platformBuyFee: new BN(0),
    platformSellFee: new BN(0),
    tradingFeeBps: 100, // 1%
    devFeeShareBps: 5000, // 50%
    devFeeEnabled: true,
    curveLimit: new BN(100),
    lamportAmountConfig: {
      range: {
        min: new BN(1000000), // 1 SOL
        max: new BN(1000000000), // 1000 SOL
      },
    },
    tokenSupplyConfig: {
      range: {
        min: new BN(1000000), // 1 SOL
        max: new BN(1000000000), // 1000 SOL
      },
    },
    tokenDecimalsConfig: {
      range: {
        min: 6,
        max: 9,
      },
    },
  };

  // Add logging to verify the configuration object
  console.log("New Config:", newConfig);
  console.log("Config PDA:", configPDA.toBase58());
  console.log("Global Vault PDA:", globalVaultPDA.toBase58());
  console.log("Global WSOL Account PDA:", globalWsolAccountPDA.toBase58());

  const accounts = {
    payer: deployer.wallet.publicKey,
    config: configPDA,
    globalVault: globalVaultPDA,
    globalWsolAccount: globalWsolAccountPDA,
    nativeMint: nativeMint,
    systemProgram: web3.SystemProgram.programId,
    tokenProgram: tokenProgramId,
    associatedTokenProgram: associatedTokenProgramId,
  };

  // Send the configure transaction
  try {
    const txSignature = await program.methods
      .configure(newConfig)
      .accounts(accounts)
      .rpc();

    console.log("Transaction sent successfully!");
    console.log("Signature:", txSignature);
  } catch (err) {
    console.error("Transaction failed:", err);
  }
})();
