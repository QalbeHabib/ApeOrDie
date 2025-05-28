import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ApeOrDie } from "../types/types/ApeOrDie";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

(async () => {
  // Set up the Anchor provider (e.g., env variables and wallet)
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const signerWallet = anchor.web3.Keypair.fromSecretKey(
    (provider.wallet as NodeWallet).payer.secretKey
  );

  // Instantiate the program using the IDL and programId.
  const program = anchor.workspace.ApeOrDie as Program<ApeOrDie>;

  // Constants for token metadata
  const name = "Turkey Day";
  const symbol = "$Turkey";
  const uri =
    "https://rose-causal-albatross-891.mypinata.cloud/ipfs/bafkreibsbjymmiwvbwhl2bzspkksbguk7yjxkbbscqb3b3t6y4evfhq7pe";
  // this is on IPFS (Pinata ifps)
  // this metada is sotred on pinata
  const decimals = 9;
  const tokenSupply = new anchor.BN(1000000000000000);
  const reserveLamport = new anchor.BN(280000000);

  console.log("Decimals:", decimals);
  console.log("Token Supply:", tokenSupply.toNumber());
  console.log("Reserve Lamport:", reserveLamport.toNumber());

  // Derive the PDA for the "config" account.
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  // Derive the PDA for the global vault to get the bump
  const [globalVaultPDA, globalVaultBump] =
    web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      program.programId
    );

  // Fetch the config account to get team wallet
  const configAccount = await program.account.config.fetch(configPDA);

  // Generate keypair for the token mint
  const tokenMintKp = Keypair.generate();

  // Derive the PDA for the bonding curve account
  const [bondingCurvePDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), tokenMintKp.publicKey.toBuffer()],
    program.programId
  );

  // Derive the PDA for the token metadata account
  const [tokenMetadataPDA] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      tokenMintKp.publicKey.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  // Derive the PDA for the global token account
  const [globalTokenAccountPDA] = web3.PublicKey.findProgramAddressSync(
    [
      globalVaultPDA.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      tokenMintKp.publicKey.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Derive the PDA for the team wallet associated token account (ATA)
  const [teamWalletATAPDA] = web3.PublicKey.findProgramAddressSync(
    [
      configAccount.teamWallet.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      tokenMintKp.publicKey.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Send the transaction to launch a token
  try {
    //  here is our program calling the launch methods
    const tx = await program.methods
      .launch(decimals, tokenSupply, reserveLamport, name, symbol, uri)
      .accounts({
        // @ts-ignore
        globalConfig: configPDA,
        globalVault: globalVaultPDA,
        creator: provider.wallet.publicKey,
        token: tokenMintKp.publicKey,
        bondingCurve: bondingCurvePDA,
        tokenMetadataAccount: tokenMetadataPDA,
        globalTokenAccount: globalTokenAccountPDA,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        mplTokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        teamWallet: configAccount.teamWallet,
        teamWalletAta: teamWalletATAPDA,
      })
      .signers([signerWallet, tokenMintKp])
      .rpc();

    console.log("Token launch transaction successful with signature:", tx);
  } catch (error) {
    console.error("Token launch transaction failed:", error);
  }
})();

// hery brother i am going to run the program
// our program is deployed at this address Ks6N2eSijgaQ6Gjpjc78M6deX8LrngprTPt5zxombdK
// and this is the script the used to launch token using the program method (launch)
