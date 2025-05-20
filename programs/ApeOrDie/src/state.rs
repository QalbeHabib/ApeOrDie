use crate::constants::LAMPORT_DECIMALS;
use crate::errors::*;
use crate::events::CompleteEvent;
use crate::utils::*;
use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use core::fmt::Debug;

pub const FEE_BASIS_POINTS: u128 = 10000;
pub const HUNDRED_PERCENT_BPS: u128 = 10000;
#[account]
pub struct Config {
    pub authority: Pubkey,
    //  use this for 2 step ownership transfer
    pub pending_authority: Pubkey,

    pub team_wallet: Pubkey,

    // New field for developer wallet address
    pub dev_wallet: Pubkey,

    pub init_bonding_curve: f64, // bonding curve init percentage. The remaining amount is sent to team wallet for distribution to agent

    pub platform_buy_fee: u128, //  platform fee percentage
    pub platform_sell_fee: u128,

    // Trading fee configuration
    pub trading_fee_bps: u16,   // Trading fee in basis points (100 = 1%)
    pub dev_fee_share_bps: u16, // Dev share of trading fee (5000 = 50%)
    pub dev_fee_enabled: bool,  // Whether to split fees with dev wallet

    pub curve_limit: u64, //  lamports to complete the bonding curve

    pub lamport_amount_config: AmountConfig<u64>,
    pub token_supply_config: AmountConfig<u64>,
    pub token_decimals_config: AmountConfig<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum AmountConfig<T: PartialEq + PartialOrd + Debug> {
    Range { min: Option<T>, max: Option<T> },
    Enum(Vec<T>),
}

impl<T: PartialEq + PartialOrd + Debug> AmountConfig<T> {
    pub fn validate(&self, value: &T) -> Result<()> {
        match self {
            Self::Range { min, max } => {
                if let Some(min) = min {
                    if value < min {
                        msg!("value {value:?} too small, expected at least {min:?}");
                        return Err(ValueTooSmall.into());
                    }
                }
                if let Some(max) = max {
                    if value > max {
                        msg!("value {value:?} too large, expected at most {max:?}");
                        return Err(ValueTooLarge.into());
                    }
                }

                Ok(())
            }
            Self::Enum(options) => {
                if options.contains(value) {
                    Ok(())
                } else {
                    msg!("invalid value {value:?}, expected one of: {options:?}");
                    Err(ValueInvalid.into())
                }
            }
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct BondingCurve {
    pub token_mint: Pubkey,
    pub creator: Pubkey,
    pub init_lamport: u64,
    pub reserve_lamport: u64,
    pub reserve_token: u64,
    pub curve_limit: u64, // Store curve limit at launch time
    pub is_completed: bool,
}
pub trait BondingCurveAccount<'info> {
    // Updates the token reserves in the liquidity pool
    fn update_reserves(
        &mut self,
        global_config: &Account<'info, Config>,
        reserve_one: u64,
        reserve_two: u64,
    ) -> Result<bool>;
    #[allow(clippy::too_many_arguments)]
    fn swap(
        &mut self,
        global_config: &Account<'info, Config>,
        token_mint: &Account<'info, Mint>,
        global_ata: &mut AccountInfo<'info>,
        user_ata: &mut AccountInfo<'info>,
        source: &mut AccountInfo<'info>,
        team_wallet: &mut AccountInfo<'info>,
        _team_wallet_ata: &mut AccountInfo<'info>,
        dev_wallet: Option<&mut AccountInfo<'info>>,
        _dev_wallet_ata: Option<&mut AccountInfo<'info>>,
        amount: u64,
        direction: u8,
        minimum_receive_amount: u64,
        deadline: i64,
        user: &Signer<'info>,
        signer: &[&[&[u8]]],
        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
    ) -> Result<u64>;

    // Calculate the output amount and the fee amounts (in SOL) for a swap
    fn cal_amount_out(
        &self,
        amount: u64, // Input amount (tokens if selling, SOL if buying)
        direction: u8,
        platform_sell_fee: u128,
        platform_buy_fee: u128,
        trading_fee_bps: u16,
        dev_fee_share_bps: u16,
        dev_fee_enabled: bool,
    ) -> Result<(u64, u64, u64)>; // Returns (output_amount, platform_fee, dev_fee)
}

impl<'info> BondingCurveAccount<'info> for Account<'info, BondingCurve> {
    fn update_reserves(
        &mut self,
        _global_config: &Account<'info, Config>,
        reserve_token: u64,
        reserve_lamport: u64,
    ) -> Result<bool> {
        self.reserve_token = reserve_token;
        self.reserve_lamport = reserve_lamport;

        if reserve_lamport >= self.curve_limit {
            msg!("curve is completed");
            self.is_completed = true;
            return Ok(true);
        }

        Ok(false)
    }

    fn swap(
        &mut self,
        global_config: &Account<'info, Config>,

        token_mint: &Account<'info, Mint>,
        global_ata: &mut AccountInfo<'info>,
        user_ata: &mut AccountInfo<'info>,

        source: &mut AccountInfo<'info>,
        team_wallet: &mut AccountInfo<'info>,
        _team_wallet_ata: &mut AccountInfo<'info>,
        dev_wallet: Option<&mut AccountInfo<'info>>,
        _dev_wallet_ata: Option<&mut AccountInfo<'info>>,

        amount: u64,
        direction: u8,
        minimum_receive_amount: u64,
        deadline: i64,

        user: &Signer<'info>,
        signer: &[&[&[u8]]],

        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
    ) -> Result<u64> {
        if amount == 0 {
            return err!(PumpfunError::InvalidAmount);
        }

        // Deadline check
        let current_timestamp = Clock::get()?.unix_timestamp;
        require!(
            current_timestamp <= deadline,
            PumpfunError::TransactionExpired
        );

        msg!("curve_limit: {:?} ", global_config.curve_limit);
        msg!("reserve_lamport: {:?} ", self.reserve_lamport);

        // Calculate swap and refund amounts
        let (amount_to_swap, _refund_amount, adjusted_minimum_receive) = if direction == 1 {
            (amount, 0, minimum_receive_amount)
        } else {
            let remaining = self.curve_limit.saturating_sub(self.reserve_lamport);
            if amount > remaining {
                let adjustment_ratio = convert_to_float(remaining, LAMPORT_DECIMALS)
                    / convert_to_float(amount, LAMPORT_DECIMALS);
                let adjusted_minimum = convert_from_float(
                    convert_to_float(minimum_receive_amount, token_mint.decimals)
                        * adjustment_ratio,
                    token_mint.decimals,
                );
                (remaining, amount - remaining, adjusted_minimum)
            } else {
                (amount, 0, minimum_receive_amount)
            }
        };

        msg!("Mint: {:?} ", token_mint.key());
        msg!(
            "Swap: {:?} {:?} {:?} (Amount to Swap)",
            user.key(),
            direction,
            amount_to_swap
        );

        // Calculate swap output and fees
        let (amount_out, platform_fee, dev_fee) = self.cal_amount_out(
            amount_to_swap,
            direction,
            global_config.platform_sell_fee,
            global_config.platform_buy_fee,
            global_config.trading_fee_bps,
            global_config.dev_fee_share_bps,
            global_config.dev_fee_enabled,
        )?;

        // Total fee is the sum of platform and dev fees
        let total_fee = platform_fee + dev_fee;

        msg!(
            "Amount Out: {:?}, Platform Fee: {:?}, Dev Fee: {:?}",
            amount_out,
            platform_fee,
            dev_fee
        );

        if amount_out < adjusted_minimum_receive {
            return Err(PumpfunError::ReturnAmountTooSmall.into());
        }

        if direction == 1 {
            // Selling Tokens for SOL
            // amount_to_swap = input tokens
            // amount_out = net SOL output
            // total_fee = fee in SOL (platform_fee + dev_fee)

            let gross_sol_output = amount_out
                .checked_add(total_fee)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let new_reserve_token = self
                .reserve_token
                .checked_add(amount_to_swap) // Add the full token amount received from user
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let new_reserve_lamport = self
                .reserve_lamport
                .checked_sub(gross_sol_output) // Subtract the total SOL leaving the pool
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            self.update_reserves(global_config, new_reserve_token, new_reserve_lamport)?;

            msg! {"Reserves: {:?} {:?}", new_reserve_token, new_reserve_lamport};

            // Transfer tokens from user to pool
            token_transfer_user(
                user_ata.clone(),
                user,
                global_ata.clone(),
                token_program,
                amount_to_swap, // Transfer the full input token amount
            )?;

            // Transfer NET SOL from pool to user
            sol_transfer_with_signer(
                source.clone(), // global_vault
                user.to_account_info(),
                system_program,
                signer,
                amount_out, // Transfer net SOL amount
            )?;

            // Transfer platform fee to team wallet
            if platform_fee > 0 {
                sol_transfer_with_signer(
                    source.clone(), // global_vault
                    team_wallet.clone(),
                    system_program,
                    signer,
                    platform_fee,
                )?;
            }

            // Transfer dev fee if enabled
            if dev_fee > 0 && global_config.dev_fee_enabled {
                if let Some(dev_wallet_info) = dev_wallet {
                    sol_transfer_with_signer(
                        source.clone(), // global_vault
                        dev_wallet_info.clone(),
                        system_program,
                        signer,
                        dev_fee,
                    )?;
                }
            }
        } else {
            // Buying Tokens with SOL
            // amount_to_swap = input SOL used in calculation (potentially capped)
            // amount_out = net token output
            // total_fee = fee in SOL (platform_fee + dev_fee)

            let adjusted_sol_input = amount_to_swap
                .checked_sub(total_fee)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?; // SOL used for actual swap after fee

            let new_reserve_token = self
                .reserve_token
                .checked_sub(amount_out) // Subtract tokens leaving the pool
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let new_reserve_lamport = self
                .reserve_lamport
                .checked_add(adjusted_sol_input) // Add SOL used for swap (amount_to_swap - fee)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let is_completed =
                self.update_reserves(global_config, new_reserve_token, new_reserve_lamport)?;

            if is_completed {
                emit!(CompleteEvent {
                    user: user.key(),
                    mint: token_mint.key(),
                    bonding_curve: self.key()
                });
            }

            msg! {"Reserves: {:?} {:?}", new_reserve_token, new_reserve_lamport};

            // Transfer tokens from pool to user
            token_transfer_with_signer(
                global_ata.clone(),
                source.clone(),
                user_ata.clone(),
                token_program,
                signer,
                amount_out, // Transfer the calculated token amount
            )?;

            // Transfer SOL from user to pool
            // User sends the full amount_to_swap (SOL potentially capped by curve limit)
            sol_transfer_from_user(user, source.clone(), system_program, amount_to_swap)?;

            // Transfer platform fee to team wallet
            if platform_fee > 0 {
                sol_transfer_with_signer(
                    source.clone(), // global_vault
                    team_wallet.clone(),
                    system_program,
                    signer,
                    platform_fee,
                )?;
            }

            // Transfer dev fee if enabled
            if dev_fee > 0 && global_config.dev_fee_enabled {
                if let Some(dev_wallet_info) = dev_wallet {
                    sol_transfer_with_signer(
                        source.clone(), // global_vault
                        dev_wallet_info.clone(),
                        system_program,
                        signer,
                        dev_fee,
                    )?;
                }
            }
        }
        msg!(
            "SwapEvent: {:?} {:?} {:?}",
            user.key(),
            direction,
            amount_out
        );
        Ok(amount_out)
    }

    // Calculate the output amount and the fee amounts (in SOL) for a swap
    fn cal_amount_out(
        &self,
        amount: u64, // Input amount (tokens if selling, SOL if buying)
        direction: u8,
        platform_sell_fee: u128,
        platform_buy_fee: u128,
        trading_fee_bps: u16,
        dev_fee_share_bps: u16,
        dev_fee_enabled: bool,
    ) -> Result<(u64, u64, u64)> {
        let amount_u128 = amount as u128;

        if direction == 1 {
            // Selling tokens for SOL: dy = (y * dx) / (x + dx)
            // amount = dx (input tokens)
            // y = reserve_lamport, x = reserve_token
            if self.reserve_token == 0 || self.reserve_lamport == 0 {
                return Ok((0, 0, 0)); // Avoid division by zero if pool is empty
            }

            let numerator = (self.reserve_lamport as u128)
                .checked_mul(amount_u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let denominator = (self.reserve_token as u128)
                .checked_add(amount_u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let gross_sol_output = numerator
                .checked_div(denominator)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            // Calculate fee based on gross SOL output
            let sol_fee = gross_sol_output
                .checked_mul(platform_sell_fee)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
                .checked_div(FEE_BASIS_POINTS)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let net_sol_output = gross_sol_output
                .checked_sub(sol_fee)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let platform_fee = sol_fee
                .checked_mul(trading_fee_bps as u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
                .checked_div(FEE_BASIS_POINTS)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let dev_fee = if dev_fee_enabled {
                sol_fee
                    .checked_mul(dev_fee_share_bps as u128)
                    .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
                    .checked_div(FEE_BASIS_POINTS)
                    .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
            } else {
                0
            };

            Ok((net_sol_output as u64, platform_fee as u64, dev_fee as u64))
        } else {
            // Buying tokens with SOL: dx = (x * dy) / (y + dy)
            // amount = dy (input SOL)
            // x = reserve_token, y = reserve_lamport
            if self.reserve_token == 0 || self.reserve_lamport == 0 {
                return Ok((0, 0, 0)); // Avoid division by zero if pool is empty, fee is also 0
            }

            // Calculate fee based on input SOL amount
            let sol_fee = amount_u128
                .checked_mul(platform_buy_fee)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
                .checked_div(FEE_BASIS_POINTS)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let adjusted_sol_input = amount_u128
                .checked_sub(sol_fee)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            // Calculate token output based on adjusted SOL input
            let numerator = (self.reserve_token as u128)
                .checked_mul(adjusted_sol_input)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let denominator = (self.reserve_lamport as u128)
                .checked_add(adjusted_sol_input)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let token_output = numerator
                .checked_div(denominator)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let platform_fee = sol_fee
                .checked_mul(trading_fee_bps as u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
                .checked_div(FEE_BASIS_POINTS)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let dev_fee = if dev_fee_enabled {
                sol_fee
                    .checked_mul(dev_fee_share_bps as u128)
                    .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
                    .checked_div(FEE_BASIS_POINTS)
                    .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
            } else {
                0
            };

            Ok((token_output as u64, platform_fee as u64, dev_fee as u64))
        }
    }
}
