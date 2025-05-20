# ApeOrDie Program (`AGEP4SYNcoeTWX6eBAR5yFXv5inXmWwJACJqz29xYwJY`)

## Overview

ApeOrDie is a Solana program designed for the rapid launch and trading of SPL (Solana Program Library) tokens using an automated market-making mechanism known as a bonding curve. It allows creators to define token characteristics, initial liquidity, and metadata, while users can buy and sell these tokens directly against the curve. The program includes administrative functions for configuration and fee management. It shares similarities with platforms like pump.fun.

## Core Functionalities

### 1. Token Launch

- **`launch(decimals, token_supply, virtual_lamport_reserves, name, symbol, uri)`**:
  - Allows a `creator` to launch a new SPL token.
  - **Parameters**:
    - `decimals`: Number of decimal places for the token.
    - `token_supply`: Total number of tokens to be created.
    - `virtual_lamport_reserves`: Initial amount of SOL to seed the bonding curve's liquidity.
    - `name`, `symbol`, `uri`: Standard MPL token metadata.
  - **Process**:
    - Creates a new SPL Mint for the token.
    - Initializes a `BondingCurve` account associated with this token, seeding it with `virtual_lamport_reserves` (SOL) and a portion of the `token_supply`.
    - A percentage of the `token_supply` (defined in global `Config` by `init_bonding_curve`) is allocated to the bonding curve. The remaining tokens are sent to a designated `team_wallet`.
    - Creates MPL (Metaplex) token metadata for the new token.
    - The `global_vault` PDA (Program Derived Address) acts as the mint authority for the new token.
- **`launch_and_swap(...)`**:
  - A combined instruction that first launches a token (as described above) and then immediately performs a buy (swap) transaction for the token on behalf of the creator or an initial buyer.

### 2. Trading (Swapping)

- **`swap(amount, direction, minimum_receive_amount, deadline)`**:
  - Enables users to buy or sell the launched tokens.
  - **Parameters**:
    - `amount`: The amount of SOL (for buying) or tokens (for selling) to trade.
    - `direction`: `0` for buying tokens with SOL, `1` for selling tokens for SOL.
    - `minimum_receive_amount`: Slippage protection; the minimum amount of the output asset the user expects to receive.
    - `deadline`: Timestamp by which the transaction must be executed.
  - **Mechanism**:
    - Trades occur against the token's dedicated `BondingCurve` account.
    - **Pricing Formula**: The program uses a constant product-like formula (`xy=k` variant) to determine the price:
      - **Selling tokens for SOL (User sells tokens, receives SOL)**:
        `gross_sol_output = (reserve_lamport * input_tokens) / (reserve_token + input_tokens)`
      - **Buying tokens with SOL (User pays SOL, receives tokens)**:
        `token_output = (reserve_token * adjusted_sol_input) / (reserve_lamport + adjusted_sol_input)`
        (where `adjusted_sol_input` is SOL after deducting platform buy fee).
    - **Fee Structure**:
      - **Trading Fee**: A 1% fee is applied to all trades (configurable via `trading_fee_bps`).
      - **Fee Distribution**:
        - By default, the 1% fee is split equally (50/50) between the platform (`team_wallet`) and developer wallet (`dev_wallet`).
        - The admin can configure the split ratio via `dev_fee_share_bps`.
        - The admin can disable developer fees by setting `dev_fee_enabled` to false, directing all fees to the platform.
      - **Legacy Fees**: Platform fees (`platform_buy_fee`, `platform_sell_fee` in basis points) are still applied and sent to the `team_wallet`.
    - The `BondingCurve` account's `reserve_lamport` and `reserve_token` are updated after each trade.

### 3. Bonding Curve Completion

- Each `BondingCurve` has a `curve_limit` (an amount of SOL) defined at launch, derived from the global `Config`.
- When the `reserve_lamport` in a `BondingCurve` reaches this `curve_limit` due to buys, the `is_completed` flag in the `BondingCurve` account is set to `true`.
- Swaps are generally disallowed or handled differently once a curve is marked as completed (e.g., buy swaps might be restricted).

### 4. Administrative Functions

- **`configure(new_config)`**:
  - Called by the program's `authority` to set or update the global `Config` account.
  - Controls fee percentages, authority keys, team wallet, dev wallet, curve limit, and validation parameters.
  - The admin can enable/disable developer fees and adjust the fee split percentage.
- **`nominate_authority(new_admin)`**:
  - Allows the current `authority` to nominate a new pending authority.
- **`accept_authority()`**:
  - Allows the `pending_authority` to accept the admin role, completing the two-step ownership transfer.
- **`withdraw()`**:
  - Allows the `authority` to withdraw accumulated SOL and any remaining tokens from the `global_vault` PDA. This is typically used for migrating funds or if the platform is being wound down.

## Bonding Curve Mechanics

The bonding curve uses a constant product formula (similar to xy=k) to determine token prices. Here's how it works:

1. **Initial Setup**:

   - A token launches with `reserve_token` tokens and `reserve_lamport` SOL in the curve
   - For example: 300,000 tokens (30% of 1,000,000 total supply) and 1 SOL

2. **Price Determination**:

   - The price curve follows the relationship: `reserve_token × reserve_lamport = k` (constant)
   - As reserves change, prices automatically adjust
   - Initial token price ≈ `reserve_lamport / reserve_token`

3. **Price Movement**:

   - When users buy tokens: SOL increases in the curve, tokens decrease → price increases
   - When users sell tokens: SOL decreases in the curve, tokens increase → price decreases
   - The curve creates automatic price discovery based on supply and demand

4. **Curve Completion**:
   - The curve has a pre-defined limit (`curve_limit`)
   - When `reserve_lamport` reaches this limit, the curve is marked as completed
   - This mechanism creates a target valuation for the token

## Token Swap Process

### Buying Tokens (direction = 0):

1. User sends SOL to the program
2. **Calculation**:
   ```
   token_output = (reserve_token × SOL_input) / (reserve_lamport + SOL_input)
   ```
3. **Example**:
   - Initial: 300,000 tokens, 1 SOL in reserves
   - User sends: 0.1 SOL
   - Tokens received: (300,000 × 0.1) / (1 + 0.1) ≈ 27,272 tokens
   - New reserves: 272,728 tokens, 1.1 SOL

### Selling Tokens (direction = 1):

1. User sends tokens to the program
2. **Calculation**:
   ```
   SOL_output = (reserve_lamport × token_input) / (reserve_token + token_input)
   ```
3. **Example**:
   - Initial: 300,000 tokens, 1 SOL in reserves
   - User sends: 10,000 tokens
   - SOL received: (1 × 10,000) / (300,000 + 10,000) ≈ 0.0323 SOL
   - New reserves: 310,000 tokens, 0.9677 SOL

## Fee Distribution System

The program implements a multi-layered fee structure:

### 1. Trading Fee (New 1% Fee):

- Applied to all trades at 1% (configurable via `trading_fee_bps = 100`)
- **Distribution**:
  - **Platform Share**: 50% of the 1% fee goes to the `team_wallet`
  - **Developer Share**: 50% of the 1% fee goes to the `dev_wallet` (if enabled)

### 2. Legacy Platform Fees:

- Additional fees from `platform_buy_fee` and `platform_sell_fee`
- 100% of these fees go to `team_wallet`

### Fee Calculation Example:

For a buy of 0.1 SOL:

1. **Trading Fee (1%)**: 0.001 SOL (0.1 × 1%)
   - Platform receives: 0.0005 SOL (50%)
   - Developer receives: 0.0005 SOL (50%)
2. **Legacy Fee** (if `platform_buy_fee` = 300 = 3%): 0.003 SOL
   - Platform receives all: 0.003 SOL
3. **Adjusted Input**: 0.096 SOL used for actual swap
4. **Total Fees**:
   - Platform total: 0.0035 SOL
   - Developer total: 0.0005 SOL

### Fee Distribution Control:

The admin can adjust fee distribution through:

- `trading_fee_bps`: Change overall trading fee percentage
- `dev_fee_share_bps`: Adjust developer's portion (5000 = 50%)
- `dev_fee_enabled`: Toggle developer fee sharing on/off
- `dev_wallet`: Change developer wallet address

When `dev_fee_enabled = false`, 100% of the trading fee goes to the platform wallet instead of being split.

## Key Accounts and Data Structures

- **`Config` (Account)**:

  - Stores global configuration for the ApeOrDie platform.
  - `authority`: The main administrative authority.
  - `pending_authority`: Used for secure authority transfer.
  - `team_wallet`: Pubkey where platform fees and a portion of initial token supplies are sent.
  - `dev_wallet`: Pubkey of developer wallet receiving a share of trading fees.
  - `init_bonding_curve`: Percentage (float) of total token supply to initialize the bonding curve with.
  - `platform_buy_fee`, `platform_sell_fee`: Legacy fee percentages (basis points) for buys and sells.
  - **Fee Configuration**:
    - `trading_fee_bps`: Trading fee in basis points (100 = 1%)
    - `dev_fee_share_bps`: Developer's share of trading fee (5000 = 50%)
    - `dev_fee_enabled`: Whether to split fees with developer wallet
  - `curve_limit`: The SOL amount at which a bonding curve is considered "complete."
  - Validation ranges/enums for token launch parameters (decimals, supply, initial lamports).

- **`BondingCurve` (Account)**:

  - Created for each launched token, acts as its specific liquidity pool and market.
  - `token_mint`: Pubkey of the SPL token.
  - `creator`: Pubkey of the user who launched the token.
  - `init_lamport`: Initial SOL deposited into the curve.
  - `reserve_lamport`: Current SOL balance in the curve.
  - `reserve_token`: Current token balance in the curve.
  - `curve_limit`: The specific SOL limit for this curve (copied from global config at launch).
  - `is_completed`: Boolean flag, true if `reserve_lamport` >= `curve_limit`.

- **PDAs (Program Derived Addresses)**:
  - `global_vault`: PDA used to hold SOL for bonding curves and to act as the mint/transfer authority for tokens within the bonding curves.
  - `token_metadata_account`: PDA for storing MPL token metadata.

## Interaction Flow Example

1.  **Setup**: The platform `authority` calls `configure` to set global parameters (fees, team wallet, dev wallet, etc.).
2.  **Token Launch**: A `creator` calls `launch`, providing token details and initial SOL. The token is created, metadata is set, and the `BondingCurve` is initialized. A portion of tokens goes to the `team_wallet`.
3.  **Trading**:
    - User A wants to buy tokens: Calls `swap` (direction: buy), sending SOL. Receives tokens based on the curve's current state.
    - Trading fees (1%) are calculated and split between platform (`team_wallet`) and developer (`dev_wallet`) if enabled.
    - Legacy platform fees are deducted from SOL and sent to `team_wallet`.
    - `reserve_lamport` increases, `reserve_token` decreases.
    - User B wants to sell tokens: Similar process but in reverse direction.
4.  **Curve Progression**: As more SOL is used to buy tokens, `reserve_lamport` in the `BondingCurve` increases. If it reaches `curve_limit`, the curve is marked `is_completed`.
5.  **Fee Management**: The admin can adjust the fee structure by updating:
    - `trading_fee_bps`: Change the overall trading fee percentage
    - `dev_fee_share_bps`: Adjust the share allocated to the developer
    - `dev_fee_enabled`: Enable/disable the developer fee split
    - `dev_wallet`: Change the developer wallet address
6.  **Withdrawal**: The platform `authority` can call `withdraw` to collect accumulated fees and other funds from the `global_vault`.

## Purpose and Use Case

ApeOrDie provides a decentralized and automated way to launch new SPL tokens with immediate liquidity through a bonding curve mechanism. It caters to projects or individuals looking for a quick way to create and distribute tokens where the price is determined algorithmically by supply and demand dynamics reflected in the curve's reserves. The fee structure benefits both the platform operators (via `team_wallet`) and developers (via `dev_wallet`), creating a sustainable ecosystem for token creation and trading.
