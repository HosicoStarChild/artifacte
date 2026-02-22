use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("F9mkXqMrgF1sSV3wDtTUpTs82B5XJ5qz9A33nBAdcNqb");

#[program]
pub mod rwa_nft {
    use super::*;

    /// Initialize the platform configuration
    pub fn initialize(
        ctx: Context<Initialize>,
        treasury: Pubkey,
        fee_basis_points: u16,
    ) -> Result<()> {
        let config = &mut ctx.accounts.platform_config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.fee_basis_points = fee_basis_points;
        config.total_minted = 0;
        config.created_at = Clock::get()?.unix_timestamp;
        config.bump = ctx.bumps.platform_config;
        Ok(())
    }

    /// Mint a new RWA NFT (authority only)
    pub fn mint_rwa_nft(
        ctx: Context<MintRwaNft>,
        name: String,
        category: AssetCategory,
        uri: String,
        appraised_value: u64,
        condition: String,
    ) -> Result<()> {
        require!(name.len() <= 64, RwaNftError::NameTooLong);
        require!(uri.len() <= 200, RwaNftError::UriTooLong);
        require!(condition.len() <= 32, RwaNftError::ConditionTooLong);

        // Verify the caller is the authority
        let config = &ctx.accounts.platform_config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            RwaNftError::UnauthorizedMinter
        );

        // Create metadata PDA for this RWA
        let metadata = &mut ctx.accounts.rwa_metadata;
        metadata.mint = ctx.accounts.mint.key();
        metadata.name = name;
        metadata.category = category;
        metadata.uri = uri;
        metadata.appraised_value = appraised_value;
        metadata.condition = condition;
        metadata.minted_at = Clock::get()?.unix_timestamp;
        metadata.appraised_at = Clock::get()?.unix_timestamp;
        metadata.bump = ctx.bumps.rwa_metadata;

        // Increment total minted count
        let config = &mut ctx.accounts.platform_config;
        config.total_minted = config
            .total_minted
            .checked_add(1)
            .ok_or(RwaNftError::OverflowError)?;

        emit!(RwaNftMinted {
            mint: ctx.accounts.mint.key(),
            name: metadata.name.clone(),
            category: metadata.category.clone(),
            appraised_value,
            timestamp: metadata.minted_at,
        });

        Ok(())
    }

    /// Update the appraised value of an RWA NFT (authority only)
    pub fn update_appraisal(
        ctx: Context<UpdateAppraisal>,
        new_appraised_value: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.platform_config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            RwaNftError::UnauthorizedUpdater
        );

        let metadata = &mut ctx.accounts.rwa_metadata;
        metadata.appraised_value = new_appraised_value;
        metadata.appraised_at = Clock::get()?.unix_timestamp;

        emit!(AppraisalUpdated {
            mint: metadata.mint,
            new_value: new_appraised_value,
            timestamp: metadata.appraised_at,
        });

        Ok(())
    }

    /// Transfer RWA NFT from one owner to another
    pub fn transfer_rwa(
        ctx: Context<TransferRwa>,
        amount: u64,
    ) -> Result<()> {
        // Transfer the NFT token
        let transfer_accounts = Transfer {
            from: ctx.accounts.from_token_account.to_account_info(),
            to: ctx.accounts.to_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            ),
            amount,
        )?;

        emit!(RwaNftTransferred {
            mint: ctx.accounts.mint.key(),
            from: ctx.accounts.owner.key(),
            to: ctx.accounts.to_token_account.owner,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ============================================================================
// Instructions
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PlatformConfig::INIT_SPACE,
        seeds = [b"platform"],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintRwaNft<'info> {
    #[account(mut)]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + RwaMetadata::INIT_SPACE,
        seeds = [b"rwa", mint.key().as_ref()],
        bump,
    )]
    pub rwa_metadata: Account<'info, RwaMetadata>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAppraisal<'info> {
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(
        mut,
        seeds = [b"rwa", rwa_metadata.mint.as_ref()],
        bump = rwa_metadata.bump,
    )]
    pub rwa_metadata: Account<'info, RwaMetadata>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferRwa<'info> {
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub from_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_token_account: Account<'info, TokenAccount>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ============================================================================
// State
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_basis_points: u16,
    pub total_minted: u32,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum AssetCategory {
    DigitalArt,
    Spirits,
    TCGCards,
    SportsCards,
    Watches,
}

#[account]
#[derive(InitSpace)]
pub struct RwaMetadata {
    pub mint: Pubkey,
    #[max_len(64)]
    pub name: String,
    pub category: AssetCategory,
    #[max_len(200)]
    pub uri: String,
    pub appraised_value: u64,
    #[max_len(32)]
    pub condition: String,
    pub minted_at: i64,
    pub appraised_at: i64,
    pub bump: u8,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct RwaNftMinted {
    pub mint: Pubkey,
    pub name: String,
    pub category: AssetCategory,
    pub appraised_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct AppraisalUpdated {
    pub mint: Pubkey,
    pub new_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct RwaNftTransferred {
    pub mint: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub timestamp: i64,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum RwaNftError {
    #[msg("Name exceeds maximum length of 64")]
    NameTooLong,
    #[msg("URI exceeds maximum length of 200")]
    UriTooLong,
    #[msg("Condition exceeds maximum length of 32")]
    ConditionTooLong,
    #[msg("Only the authority can mint RWA NFTs")]
    UnauthorizedMinter,
    #[msg("Only the authority can update appraisals")]
    UnauthorizedUpdater,
    #[msg("Overflow error")]
    OverflowError,
}
