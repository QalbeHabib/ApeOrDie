# Raydium Vault Program (`GKWRSMV4sEXrdMfBmUbjbf5B13tSFNeFzAsNQTYimgEZ`)

## Overview

The Raydium Vault program is a Solana smart contract designed to act as a custodial and management layer for users' Raydium Concentrated Liquidity Market Maker (CLMM) position NFTs. It focuses on automating the collection of trading fees accrued by these positions, particularly those that might be locked or staked within Raydium's ecosystem. The vault is managed by a set of authorities for operational, administrative, and emergency functions.

## Core Functionalities

### 1. Vault Initialization

- **`initialize(init_config)`**:
  - Sets up the global `VaultConfig` for the entire program.
  - **Parameters** (`InitVaultConfig`):
    - `executor_authority`: Pubkey of the entity authorized to perform operational tasks (deposits, claims).
    - `emergency_authority`: Pubkey for emergency actions (e.g., withdrawing NFTs).
    - `manager_authority`: Pubkey for administrative tasks (e.g., updating other authorities).
  - **Process**:
    - Creates a single `VaultConfig` PDA account, seeded by `VAULT_CONFIG_SEED`.
    - This account stores the three authority public keys.

### 2. NFT Deposit (Custodial)

- **`deposit(claimer_address)`**:
  - Allows the `executor_authority` to deposit a Raydium CLMM position NFT into the vault on behalf of a user.
  - **Parameters**:
    - `claimer_address`: The public key of the user who owns the NFT and is entitled to claim accrued fees.
  - **Process**:
    - The `executor_authority` signs the transaction.
    - A `UserPosition` PDA account is created (or updated if it already exists for that NFT), seeded by `POSITION_SEED` and the `position_nft` mint address. This account stores:
      - `claimer`: The `claimer_address` provided.
      - `position_nft`: The mint address of the deposited Raydium CLMM NFT.
      - `amount`: Typically 1 for an NFT.
      - Timestamps for creation and last update.
    - The actual Raydium CLMM `position_nft` (an SPL token) is transferred from an account owned by the `executor_authority` to a dedicated PDA token account (`nft_token_faucet`). This `nft_token_faucet` is controlled by the vault program itself (its authority is the `VaultConfig` PDA).

### 3. Fee Claiming (Automated Harvesting)

- **`claim()`**:
  - Allows the `executor_authority` to trigger the collection of trading fees accrued to a specific Raydium CLMM position NFT held within the vault.
  - **Process**:
    - The `executor_authority` signs the transaction.
    - The instruction performs a Cross-Program Invocation (CPI) to a Raydium `RaydiumLiquidityLocking` program, specifically calling its `collect_cp_fees` (collect concentrated pool fees) function.
    - **Key Accounts for CPI**:
      - The `VaultConfig` PDA acts as the `fee_nft_owner` in the context of the CPI. This is crucial because the vault custodies the NFT and thus has the authority to claim fees on its behalf.
      - The associated `UserPosition` account is used to identify the `claimer`.
      - The Raydium pool state, liquidity information, and relevant token accounts are provided to the Raydium program.
    - The collected fees (token0 and token1 of the liquidity pair from the Raydium pool) are transferred **directly** to the Associated Token Accounts (ATAs) owned by the `user_position.claimer` (the original user).
    - The Raydium CLMM position NFT itself **remains custodied by the vault** within the `nft_token_faucet` PDA.

### 4. Emergency Withdrawal

- **`emergency_withdraw()`**:
  - Allows the `emergency_authority` (defined in `VaultConfig`) to withdraw a custodied Raydium CLMM position NFT from the vault.
  - **Process**:
    - The `emergency_authority` signs the transaction.
    - The specified `position_nft` is transferred from the vault's `nft_token_faucet` PDA to a `to_account` (a token account) designated by the `emergency_authority`.
    - The `amount` in the corresponding `UserPosition` account is typically decremented (e.g., from 1 to 0) to reflect the NFT's withdrawal.
    - This function is a safeguard, and the NFT is sent to an account controlled by the emergency authority, not necessarily back to the original `claimer` directly through this instruction.

### 5. Authority Management

- **`change_executor_authority(new_executor)`**: Allows the `manager_authority` to update the `executor_authority`.
- **`change_manager_authority(new_manager)`**: Allows the current `manager_authority` to transfer its role to a `new_manager`.
- **`change_emergency_authority(new_emergency)`**: Allows the `manager_authority` to update the `emergency_authority`.
- **`change_claimer(new_claimer)`**: Allows the `executor_authority` to update the `claimer` address associated with a specific `UserPosition` (and thus, a deposited NFT). This might be used for transferring ownership of the claim rights within the vault system.

## Key Accounts and Data Structures

- **`VaultConfig` (Account - PDA)**:

  - The central configuration account for the vault.
  - `executor_authority`: Pubkey for executing deposits and claims.
  - `emergency_authority`: Pubkey for emergency NFT withdrawals.
  - `manager_authority`: Pubkey for updating other authorities.

- **`UserPosition` (Account - PDA)**:

  - Tracks an individual user's deposited Raydium CLMM position NFT.
  - `claimer`: The user's pubkey, who is entitled to the collected fees.
  - `position_nft`: The mint address of the custodied Raydium CLMM NFT.
  - `amount`: Number of NFTs (usually 1).
  - `created_at`, `last_updated`: Timestamps.

- **PDAs (Program Derived Addresses)**:
  - `nft_token_faucet`: A PDA token account for each unique `position_nft` mint, holding the actual NFT. The `VaultConfig` PDA is the authority of these faucet accounts.

## Interaction Flow Example

1.  **Initialization**: The `manager_authority` (or initial deployer) calls `initialize` to set up the `VaultConfig` with the designated executor, emergency, and manager authorities.
2.  **NFT Deposit**: A user wishes to use the vault service. They coordinate with the entity controlling the `executor_authority`. The `executor_authority` calls `deposit`, providing the user's Raydium CLMM position NFT and the user's public key as the `claimer_address`. The NFT is transferred into the vault's custody.
3.  **Fee Harvesting**: Periodically, the service/entity controlling the `executor_authority` calls `claim` for the user's `UserPosition`. This triggers a CPI to Raydium, and any accrued trading fees are sent directly to the user's (`claimer`'s) wallet.
4.  **Authority Update**: If needed, the `manager_authority` can update the `executor_authority` or `emergency_authority`.
5.  **Emergency**: If there's a critical issue, the `emergency_authority` can execute `emergency_withdraw` to retrieve the NFT from the vault.

## Purpose and Use Case

The Raydium Vault program serves as a yield optimization or automated fee harvesting service for users holding Raydium CLMM position NFTs. By depositing their NFTs into the vault, users can potentially benefit from an automated service (the `executor_authority`) that handles the process of claiming trading fees from Raydium. This can be particularly useful for positions that are locked or part of other staking mechanisms where manual claiming might be cumbersome. The vault abstracts away the direct interaction with Raydium's fee collection mechanisms, providing a managed, custodial solution.
