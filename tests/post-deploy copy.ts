import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ApeOrDie } from "../programs/ApeOrDie/target/types/ape_or_die";
import * as web3 from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

describe("post-deploy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ApeOrDie as Program<ApeOrDie>;

  it("Configures the program", async () => {
    const [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const [globalVaultPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      program.programId
    );

    const tx1 = await program.methods
      .configure({
        authority: provider.wallet.publicKey,
        pendingAuthority: provider.wallet.publicKey,
        teamWallet: provider.wallet.publicKey,
        devWallet: provider.wallet.publicKey,
        initBondingCurve: 10,
        platformBuyFee: new anchor.BN(0),
        platformSellFee: new anchor.BN(0),
        tradingFeeBps: 100, // 1%
        devFeeShareBps: 5000, // 50%
        devFeeEnabled: true,
        curveLimit: new anchor.BN(100),
        lamportAmountConfig: {
          range: {
            min: new anchor.BN(1000000),
            max: new anchor.BN(1000000000),
          },
        },
        tokenSupplyConfig: {
          range: {
            min: new anchor.BN(1000000),
            max: new anchor.BN(1000000000),
          },
        },
        tokenDecimalsConfig: {
          range: {
            min: 6,
            max: 9,
          },
        },
      })
      .accounts({
        payer: provider.wallet.publicKey,
        // @ts-ignore
        config: configPDA,
        globalVault: globalVaultPDA,
        globalWsolAccount: globalVaultPDA,
        nativeMint: new web3.PublicKey(
          "So11111111111111111111111111111111111111112"
        ),
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: new web3.PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
        associatedTokenProgram: new web3.PublicKey(
          "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        ),
      })
      .rpc();

    console.log("Configuration transaction:", tx1);
  });

  it("Nominates an authority", async () => {
    const [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const newAuthority = web3.Keypair.generate().publicKey;

    const tx2 = await program.methods
      .nominateAuthority(newAuthority)
      .accounts({
        admin: provider.wallet.publicKey,
        // @ts-ignore
        globalConfig: configPDA,
      })
      .rpc();

    console.log("Authority nomination transaction:", tx2);
  });

  it("Accepts authority", async () => {
    const [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const tx3 = await program.methods
      .acceptAuthority()
      .accounts({
        newAdmin: provider.wallet.publicKey,
        // @ts-ignore
        globalConfig: configPDA,
      })
      .rpc();

    console.log("Authority acceptance transaction:", tx3);
  });

  it("Launches a token", async () => {
    const [configPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const [globalVaultPDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      program.programId
    );

    const tokenMint = web3.Keypair.generate();
    const [tokenMetadataPDA] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new web3.PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ).toBuffer(),
        tokenMint.publicKey.toBuffer(),
      ],
      new web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    const [bondingCurvePDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve"), tokenMint.publicKey.toBuffer()],
      program.programId
    );

    const [globalTokenAccountPDA] = web3.PublicKey.findProgramAddressSync(
      [
        globalVaultPDA.toBuffer(),
        new web3.PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ).toBuffer(),
        tokenMint.publicKey.toBuffer(),
      ],
      new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    );

    const [teamWalletATAPDA] = web3.PublicKey.findProgramAddressSync(
      [
        provider.wallet.publicKey.toBuffer(),
        new web3.PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ).toBuffer(),
        tokenMint.publicKey.toBuffer(),
      ],
      new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    );

    const tx4 = await program.methods
      .launch(
        6,
        new anchor.BN(1000000),
        new anchor.BN(1000000),
        "YourTokenName",
        "YTN",
        "https://example.com/metadata.json"
      )
      .accounts({
        // @ts-ignore
        globalConfig: configPDA,
        globalVault: globalVaultPDA,
        creator: provider.wallet.publicKey,
        token: tokenMint.publicKey,
        bondingCurve: bondingCurvePDA,
        tokenMetadataAccount: tokenMetadataPDA,
        globalTokenAccount: globalTokenAccountPDA,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: new web3.PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
        associatedTokenProgram: new web3.PublicKey(
          "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        ),
        mplTokenMetadataProgram: new web3.PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ),
        teamWallet: provider.wallet.publicKey,
        teamWalletAta: teamWalletATAPDA,
      })
      .signers([tokenMint])
      .rpc();

    console.log("Token launch transaction:", tx4);
  });
});

export async function sampleConfigure(
  program: Program<ApeOrDie>,
  provider: anchor.AnchorProvider
) {
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [globalVaultPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  await program.methods
    .configure({
      authority: provider.wallet.publicKey,
      pendingAuthority: provider.wallet.publicKey,
      teamWallet: provider.wallet.publicKey,
      devWallet: provider.wallet.publicKey,
      initBondingCurve: 10,
      platformBuyFee: new anchor.BN(0),
      platformSellFee: new anchor.BN(0),
      tradingFeeBps: 100,
      devFeeShareBps: 5000,
      devFeeEnabled: true,
      curveLimit: new anchor.BN(100),
      lamportAmountConfig: {
        range: {
          min: new anchor.BN(1000000),
          max: new anchor.BN(1000000000),
        },
      },
      tokenSupplyConfig: {
        range: {
          min: new anchor.BN(1000000),
          max: new anchor.BN(1000000000),
        },
      },
      tokenDecimalsConfig: {
        range: {
          min: 6,
          max: 9,
        },
      },
    })
    .accounts({
      payer: provider.wallet.publicKey,
      // @ts-ignore
      config: configPDA,
      globalVault: globalVaultPDA,
      globalWsolAccount: globalVaultPDA,
      nativeMint: new web3.PublicKey(
        "So11111111111111111111111111111111111111112"
      ),
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: new web3.PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      ),
      associatedTokenProgram: new web3.PublicKey(
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
      ),
    })
    .rpc();
}

export async function sampleNominateAuthority(
  program: Program<ApeOrDie>,
  provider: anchor.AnchorProvider,
  newAuthority: web3.PublicKey
) {
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  await program.methods
    .nominateAuthority(newAuthority)
    .accounts({
      admin: provider.wallet.publicKey,
      // @ts-ignore
      globalConfig: configPDA,
    })
    .rpc();
}

export async function sampleAcceptAuthority(
  program: Program<ApeOrDie>,
  provider: anchor.AnchorProvider
) {
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  await program.methods
    .acceptAuthority()
    .accounts({
      newAdmin: provider.wallet.publicKey,
      // @ts-ignore
      globalConfig: configPDA,
    })
    .rpc();
}

export async function sampleLaunch(
  program: Program<ApeOrDie>,
  provider: anchor.AnchorProvider
) {
  const [configPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [globalVaultPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const tokenMint = web3.Keypair.generate();
  // ...calculate all other PDAs as in your post-deploy.ts...

  await program.methods
    .launch(
      6,
      new anchor.BN(1000000),
      new anchor.BN(1000000),
      "YourTokenName",
      "YTN",
      "https://example.com/metadata.json"
    )
    .accounts({
      // @ts-ignore
      globalConfig: configPDA,
      globalVault: globalVaultPDA,
      creator: provider.wallet.publicKey,
      token: tokenMint.publicKey,
      // ...other required accounts...
    })
    .signers([tokenMint])
    .rpc();
}

export async function sampleSwap(
  program: Program<ApeOrDie>,
  provider: anchor.AnchorProvider,
  token: web3.PublicKey,
  amount: number,
  style: number
) {
  // Fetch config and curve PDAs as needed
  // Call the swap instruction with correct accounts and arguments
  await program.methods
    .swap(
      new anchor.BN(amount),
      style,
      new anchor.BN(0),
      new anchor.BN(Date.now() / 1000 + 120)
    )
    .accounts({
      // Fill in required accounts as per your IDL
      // @ts-ignore
      // globalConfig: not correct
      globalConfig: configPDA,
    })
    .rpc();
}

export async function sampleWithdraw(
  program: Program<ApeOrDie>,
  provider: anchor.AnchorProvider,
  token: web3.PublicKey
) {
  await program.methods
    .withdraw()
    .accounts({
      admin: provider.wallet.publicKey,
      tokenMint: token,
      // ...other required accounts...
    })
    .rpc();
}
