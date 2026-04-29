use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::program_error::ProgramError;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, CloseAccount};
use anchor_spl::token_interface::{
    Mint as IfaceMint,
    TokenAccount as IfaceTokenAccount,
    TokenInterface,
};
use spl_token_2022::extension::BaseStateWithExtensions;
use spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi;
use anchor_spl::metadata::mpl_token_metadata::{
    instructions::{TransferV1, TransferV1InstructionArgs},
};

/// Transfer pNFT via Token Metadata TransferV1 CPI using Kinobi-generated builder.
/// Uses mpl_token_metadata::instructions::TransferV1 for correct serialization.
fn transfer_pnft<'info>(
    token_metadata_program: &AccountInfo<'info>,
    token: &AccountInfo<'info>,
    token_owner: &AccountInfo<'info>,
    destination_token: &AccountInfo<'info>,
    destination_owner: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    metadata: &AccountInfo<'info>,
    edition: &AccountInfo<'info>,
    token_record: &AccountInfo<'info>,
    destination_token_record: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    sysvar_instructions: &AccountInfo<'info>,
    spl_token_program: &AccountInfo<'info>,
    spl_ata_program: &AccountInfo<'info>,
    auth_rules_program: Option<&AccountInfo<'info>>,
    auth_rules: Option<&AccountInfo<'info>>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    // SECURITY: Validate token_metadata_program is actually Metaplex Token Metadata
    require_keys_eq!(
        *token_metadata_program.key,
        anchor_spl::metadata::mpl_token_metadata::ID,
        AuctionError::Unauthorized
    );

    // Use Kinobi-generated TransferV1 instruction builder for correct serialization
    // This ensures discriminator, account order, and args are all correct
    let transfer_ix = TransferV1 {
        token: *token.key,
        token_owner: *token_owner.key,
        destination_token: *destination_token.key,
        destination_owner: *destination_owner.key,
        mint: *mint.key,
        metadata: *metadata.key,
        edition: Some(*edition.key),
        token_record: Some(*token_record.key),
        destination_token_record: Some(*destination_token_record.key),
        authority: *authority.key,
        payer: *payer.key,
        system_program: *system_program.key,
        sysvar_instructions: *sysvar_instructions.key,
        spl_token_program: *spl_token_program.key,
        spl_ata_program: *spl_ata_program.key,
        authorization_rules_program: auth_rules_program.map(|a| *a.key),
        authorization_rules: auth_rules.map(|a| *a.key),
    }
    .instruction(TransferV1InstructionArgs {
        amount: 1,
        authorization_data: None,
    });

    let mut account_infos = vec![
        token.clone(), token_owner.clone(), destination_token.clone(),
        destination_owner.clone(), mint.clone(), metadata.clone(), edition.clone(),
        token_record.clone(), destination_token_record.clone(),
        authority.clone(), payer.clone(), system_program.clone(),
        sysvar_instructions.clone(), spl_token_program.clone(), spl_ata_program.clone(),
    ];
    if let Some(p) = auth_rules_program { account_infos.push(p.clone()); }
    if let Some(r) = auth_rules { account_infos.push(r.clone()); }
    account_infos.push(token_metadata_program.clone());

    if signer_seeds.is_empty() {
        anchor_lang::solana_program::program::invoke(&transfer_ix, &account_infos)
            .map_err(|_| error!(AuctionError::TransferFailed))?;
    } else {
        anchor_lang::solana_program::program::invoke_signed(&transfer_ix, &account_infos, signer_seeds)
            .map_err(|_| error!(AuctionError::TransferFailed))?;
    }
    Ok(())
}
declare_id!("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");

/// Close a token account using the correct token program (works for both Token and Token-2022)
fn close_token_account_cpi<'info>(
    token_program: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    // CloseAccount instruction index is 9 for both Token and Token-2022
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: token_program.key(),
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(account.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(destination.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(authority.key(), true),
        ],
        data: vec![9], // CloseAccount instruction discriminator
    };
    invoke_signed(
        &ix,
        &[account.clone(), destination.clone(), authority.clone(), token_program.clone()],
        signer_seeds,
    )?;
    Ok(())
}

// Deploy authority — can initialize and update treasury config
const DEPLOY_AUTHORITY: &str = "H3s3zhbcDNrLgPbUQFZYvRd9xy58nVNRC3vdg1hK1KPt";

// Fallback treasury (used only if config not yet initialized)
const TREASURY_FALLBACK: &str = "82v8xATLqdvq3cS1CXwpygVUH926QKdAd4NVxD91r4a6";

// Standard token mints
const SOL_MINT: &str = "So11111111111111111111111111111111111111112";
const USD1_MINT: &str = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Artifacte v2 (Metaplex Core) constants
const ARTIFACTE_COLLECTION_ID: &str = "jzkJTGAuDcWthM91S1ch7wPcfMUQB5CdYH6hA25K4CS";

#[cfg(test)]
fn is_missing_mpl_core_plugin_error(error: &ProgramError) -> bool {
    matches!(
        error,
        ProgramError::Custom(code)
            if *code == mpl_core::errors::MplCoreError::PluginNotFound as u32
                || *code == mpl_core::errors::MplCoreError::PluginsNotInitialized as u32
    )
}

#[cfg(test)]
mod tests {
    use super::is_missing_mpl_core_plugin_error;
    use anchor_lang::solana_program::program_error::ProgramError;

    #[test]
    fn identifies_only_missing_mpl_core_plugin_errors() {
        assert!(is_missing_mpl_core_plugin_error(&ProgramError::Custom(
            mpl_core::errors::MplCoreError::PluginNotFound as u32,
        )));
        assert!(is_missing_mpl_core_plugin_error(&ProgramError::Custom(
            mpl_core::errors::MplCoreError::PluginsNotInitialized as u32,
        )));
        assert!(!is_missing_mpl_core_plugin_error(&ProgramError::Custom(
            mpl_core::errors::MplCoreError::PluginAlreadyExists as u32,
        )));
        assert!(!is_missing_mpl_core_plugin_error(&ProgramError::InvalidArgument));
    }
}

/// Perform a Token-2022 transfer_checked CPI that properly supports transfer hooks.
/// remaining_accounts must include the hook-related accounts (extra_metas, approve_account, hook_program).
fn transfer_checked_with_hook<'info>(
    token_program: &AccountInfo<'info>,
    source: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    // Build the base transfer_checked instruction
    let mut ix = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        source.key,
        mint.key,
        destination.key,
        authority.key,
        &[],
        amount,
        decimals,
    ).map_err(|_| AuctionError::TransferFailed)?;

    // Collect all account infos for the CPI
    let mut account_infos = vec![
        source.clone(),
        mint.clone(),
        destination.clone(),
        authority.clone(),
    ];

    // Find the transfer hook program ID from mint extensions
    let mint_data = mint.try_borrow_data()?;
    let mint_state = spl_token_2022::extension::StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&mint_data)?;
    let hook_program_id = if let Ok(hook) = mint_state.get_extension::<spl_token_2022::extension::transfer_hook::TransferHook>() {
        let id: Option<Pubkey> = hook.program_id.into();
        id
    } else {
        None
    };
    drop(mint_data);

    if let Some(hook_id) = hook_program_id {
        // Add extra accounts for transfer hook execution
        add_extra_accounts_for_execute_cpi(
            &mut ix,
            &mut account_infos,
            &hook_id,
            source.clone(),
            mint.clone(),
            destination.clone(),
            authority.clone(),
            amount,
            remaining_accounts,
        ).map_err(|_| AuctionError::TransferFailed)?;
    }

    // Invoke with or without signer seeds
    if signer_seeds.is_empty() {
        anchor_lang::solana_program::program::invoke(&ix, &account_infos)?;
    } else {
        anchor_lang::solana_program::program::invoke_signed(&ix, &account_infos, signer_seeds)?;
    }
    Ok(())
}

#[program]
pub mod auction {
    use super::*;

    /// Initialize the treasury config PDA (one-time setup by deploy authority)
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        require!(
            ctx.accounts.authority.key().to_string() == DEPLOY_AUTHORITY,
            AuctionError::Unauthorized
        );
        let config = &mut ctx.accounts.treasury_config;
        config.treasury = ctx.accounts.authority.key(); // set initial treasury = deploy authority, update after
        config.authority = ctx.accounts.authority.key();
        config.bump = ctx.bumps.treasury_config;
        Ok(())
    }

    /// Update treasury address (deploy authority only)
    pub fn update_treasury(ctx: Context<UpdateTreasury>, new_treasury: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.authority.key().to_string() == DEPLOY_AUTHORITY,
            AuctionError::Unauthorized
        );
        ctx.accounts.treasury_config.treasury = new_treasury;
        emit!(TreasuryUpdated {
            old_treasury: ctx.accounts.treasury_config.treasury,
            new_treasury,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// List an item for sale (either fixed price or auction)
    ///
    /// For WNS/Token-2022 NFTs: client MUST include a WNS `approve_transfer` IX
    /// (amount=0) BEFORE this instruction in the same transaction.
    /// remaining_accounts for Token-2022:
    ///   [0] extra_metas_account PDA (readonly) - seeds: ["extra-account-metas", nft_mint]
    ///   [1] approve_account PDA (writable) - seeds: ["approve-account", nft_mint]
    ///   [2] wns_program (readonly)
    pub fn list_item<'info>(
        ctx: Context<'_, '_, '_, 'info, ListItem<'info>>,
        listing_type: ListingType,
        price: u64,
        duration_seconds: Option<i64>,
        category: ItemCategory,
        royalty_basis_points: u16,
        creator_address: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let listing = &mut ctx.accounts.listing;

        // Validate price
        require!(price > 0, AuctionError::InvalidPrice);
        require!(price <= 1_000_000_000_000_000_000, AuctionError::InvalidPrice);

        // Cap royalty basis points at 10% (1000 bps) to prevent fee manipulation
        require!(royalty_basis_points <= 1000, AuctionError::RoyaltyTooHigh);

        // Validate category matches allowed payments
        validate_category_and_payment(&category, ctx.accounts.payment_mint.key())?;

        // Validate duration for auctions
        if matches!(listing_type, ListingType::Auction) {
            require!(
                duration_seconds.is_some() && duration_seconds.unwrap() > 0,
                AuctionError::InvalidDuration
            );
        }

        // Validate token program is SPL Token or Token-2022
        require!(
            ctx.accounts.nft_token_program.key() == Token::id() || 
            ctx.accounts.nft_token_program.key() == spl_token_2022::id(),
            AuctionError::InvalidTokenProgram
        );

        // Detect Token-2022
        let is_token2022 = ctx.accounts.nft_token_program.key() != Token::id();

        listing.seller = ctx.accounts.seller.key();
        listing.nft_mint = ctx.accounts.nft_mint.key();
        listing.payment_mint = ctx.accounts.payment_mint.key();
        listing.price = price;
        listing.listing_type = listing_type;
        listing.category = category;
        listing.start_time = clock.unix_timestamp;
        listing.end_time = if let Some(duration) = duration_seconds {
            clock.unix_timestamp + duration
        } else {
            0
        };
        listing.status = ListingStatus::Active;
        listing.escrow_nft_account = ctx.accounts.escrow_nft.key();
        listing.current_bid = 0;
        listing.highest_bidder = Pubkey::default();
        listing.baxus_fee = false;
        listing.is_token2022 = is_token2022;
        listing.royalty_basis_points = royalty_basis_points;
        listing.creator_address = creator_address;
        listing.bump = ctx.bumps.listing;

        // Transfer NFT from seller to escrow
        if is_token2022 {
            // Token-2022 with transfer hook: use proper hook-aware CPI
            transfer_checked_with_hook(
                &ctx.accounts.nft_token_program.to_account_info(),
                &ctx.accounts.seller_nft_account.to_account_info(),
                &ctx.accounts.nft_mint.to_account_info(),
                &ctx.accounts.escrow_nft.to_account_info(),
                &ctx.accounts.seller.to_account_info(),
                ctx.remaining_accounts,
                1,
                0,
                &[],
            )?;
        } else {
            // Standard SPL Token
            token::transfer(
                CpiContext::new(
                    ctx.accounts.nft_token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.seller_nft_account.to_account_info(),
                        to: ctx.accounts.escrow_nft.to_account_info(),
                        authority: ctx.accounts.seller.to_account_info(),
                    },
                ),
                1,
            )?;
        }

        emit!(ListingCreated {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
            listing_type: listing_type.clone(),
            price,
            category: category.clone(),
            end_time: listing.end_time,
            payment_mint: listing.payment_mint,
        });

        Ok(())
    }

    /// Place a bid on an active auction (payment tokens only, no NFT transfer)
    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let clock = Clock::get()?;

        require!(
            matches!(listing.listing_type, ListingType::Auction),
            AuctionError::NotAnAuction
        );
        require!(
            listing.status == ListingStatus::Active,
            AuctionError::ListingNotActive
        );
        require!(
            clock.unix_timestamp < listing.end_time,
            AuctionError::AuctionEnded
        );

        // Prevent shill bidding — seller cannot bid on own auction
        require!(
            ctx.accounts.bidder.key() != listing.seller,
            AuctionError::SellerCannotBid
        );

        // Minimum 0.1 SOL increment
        let min_increment: u64 = 100_000_000;
        let min_bid = if listing.current_bid > 0 {
            listing.current_bid + min_increment
        } else {
            listing.price
        };
        require!(amount >= min_bid, AuctionError::BidTooLow);

        // Refund previous bidder
        if listing.current_bid > 0 && listing.highest_bidder != Pubkey::default() {
            // Validate previous_bidder_account belongs to actual previous highest bidder
            require!(
                ctx.accounts.previous_bidder_account.key() != Pubkey::default(),
                AuctionError::InvalidRefundAccount
            );
            // The token account address must match the expected ATA
            let expected_ata = anchor_spl::associated_token::get_associated_token_address(
                &listing.highest_bidder,
                &listing.payment_mint,
            );
            require!(
                ctx.accounts.previous_bidder_account.key() == expected_ata,
                AuctionError::InvalidRefundAccount
            );
            // Also validate the token account is owned by the SPL token program (not tampered)
            require!(
                ctx.accounts.previous_bidder_account.owner == &spl_token::ID,
                AuctionError::InvalidRefundAccount
            );

            let bid_escrow_bump = ctx.bumps.bid_escrow;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.bid_escrow.to_account_info(),
                        to: ctx.accounts.previous_bidder_account.to_account_info(),
                        authority: ctx.accounts.bid_escrow.to_account_info(),
                    },
                    &[&[
                        b"bid_escrow",
                        listing.nft_mint.as_ref(),
                        &[bid_escrow_bump],
                    ]],
                ),
                listing.current_bid,
            )?;
        }

        // Transfer new bid to escrow
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bidder_token_account.to_account_info(),
                    to: ctx.accounts.bid_escrow.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            amount,
        )?;

        listing.current_bid = amount;
        listing.highest_bidder = ctx.accounts.bidder.key();

        emit!(BidPlaced {
            nft_mint: listing.nft_mint,
            bidder: ctx.accounts.bidder.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Buy a fixed-price listing immediately
    ///
    /// For WNS/Token-2022 NFTs: client MUST include WNS `approve_transfer` IX
    /// (amount=0) BEFORE this instruction in the same transaction.
    /// remaining_accounts: same layout as list_item
    pub fn buy_now<'info>(ctx: Context<'_, '_, '_, 'info, BuyNow<'info>>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;

        require!(
            matches!(listing.listing_type, ListingType::FixedPrice),
            AuctionError::NotFixedPrice
        );
        require!(
            listing.status == ListingStatus::Active,
            AuctionError::ListingNotActive
        );

        // Resolve treasury address: use config PDA if initialized, else fallback
        let treasury_address = if let Some(ref config) = ctx.accounts.treasury_config {
            config.treasury
        } else {
            TREASURY_FALLBACK.parse::<anchor_lang::prelude::Pubkey>().unwrap()
        };
        require!(
            ctx.accounts.treasury_payment_account.owner == treasury_address,
            AuctionError::Unauthorized
        );
        require!(
            ctx.accounts.treasury.key() == treasury_address,
            AuctionError::Unauthorized
        );

        // Calculate fees (checked arithmetic to prevent overflow)
        let platform_fee = listing.price
            .checked_mul(200)
            .and_then(|x| x.checked_div(10000))
            .ok_or(AuctionError::CalculationError)?; // 2%
        let baxus_fee = if listing.baxus_fee {
            listing.price
                .checked_mul(1000)
                .and_then(|x| x.checked_div(10000))
                .ok_or(AuctionError::CalculationError)? // 10%
        } else {
            0u64
        };
        let creator_royalty = listing.price
            .checked_mul(listing.royalty_basis_points as u64)
            .and_then(|x| x.checked_div(10000))
            .ok_or(AuctionError::CalculationError)?;

        // Royalty floor: must be 0 or at least 1% (100 bps) to prevent rounding-to-zero bypass
        require!(
            listing.royalty_basis_points == 0 || listing.royalty_basis_points >= 100,
            AuctionError::InvalidRoyaltyBps
        );

        // Validate creator_payment_account when royalty > 0 (prevents royalty redirection)
        if creator_royalty > 0 {
            let expected_creator_ata = anchor_spl::associated_token::get_associated_token_address(
                &listing.creator_address,
                &listing.payment_mint,
            );
            require!(
                ctx.accounts.creator_payment_account.key() == expected_creator_ata,
                AuctionError::InvalidCreatorAccount
            );
        }

        // Mark settled BEFORE transfers (checks-effects-interactions — prevents reentrancy)
        listing.status = ListingStatus::Settled;

        let seller_amount = listing
            .price
            .checked_sub(platform_fee)
            .ok_or(AuctionError::CalculationError)?
            .checked_sub(baxus_fee)
            .ok_or(AuctionError::CalculationError)?
            .checked_sub(creator_royalty)
            .ok_or(AuctionError::CalculationError)?;

        // Payment: buyer → seller
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_payment_account.to_account_info(),
                    to: ctx.accounts.seller_payment_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            seller_amount,
        )?;

        // Payment: buyer → treasury (platform fee + BAXUS fee)
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_payment_account.to_account_info(),
                    to: ctx.accounts.treasury_payment_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            platform_fee + baxus_fee,
        )?;

        // Creator royalty — always enforced
        if creator_royalty > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer_payment_account.to_account_info(),
                        to: ctx.accounts.creator_payment_account.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                creator_royalty,
            )?;
        }

        // Transfer NFT: escrow → buyer
        let escrow_bump = ctx.bumps.escrow_nft;
        let nft_mint_key = listing.nft_mint;
        let escrow_seeds: &[&[u8]] = &[
            b"escrow_nft",
            nft_mint_key.as_ref(),
            &[escrow_bump],
        ];

        if listing.is_token2022 {
            // Token-2022 with transfer hook: escrow → buyer
            transfer_checked_with_hook(
                &ctx.accounts.nft_token_program.to_account_info(),
                &ctx.accounts.escrow_nft.to_account_info(),
                &ctx.accounts.nft_mint.to_account_info(),
                &ctx.accounts.buyer_nft_account.to_account_info(),
                &ctx.accounts.escrow_nft.to_account_info(),
                ctx.remaining_accounts,
                1,
                0,
                &[escrow_seeds],
            )?;
        } else {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.nft_token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_nft.to_account_info(),
                        to: ctx.accounts.buyer_nft_account.to_account_info(),
                        authority: ctx.accounts.escrow_nft.to_account_info(),
                    },
                    &[escrow_seeds],
                ),
                1,
            )?;
        }

        emit!(ItemPurchased {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
            buyer: ctx.accounts.buyer.key(),
            price: listing.price,
            platform_fee,
            creator_royalty,
        });

        // Close escrow_nft token account via CPI — rent to treasury (revenue)
        close_token_account_cpi(
            &ctx.accounts.nft_token_program.to_account_info(),
            &ctx.accounts.escrow_nft.to_account_info(),
            &ctx.accounts.treasury.to_account_info(),
            &ctx.accounts.escrow_nft.to_account_info(),
            &[escrow_seeds],
        )?;

        // Close listing account (owned by our program) — rent to treasury (revenue)
        let listing_info = ctx.accounts.listing.to_account_info();
        let treasury_info = ctx.accounts.treasury.to_account_info();
        let dest_starting_lamports = treasury_info.lamports();
        **treasury_info.lamports.borrow_mut() = dest_starting_lamports
            .checked_add(listing_info.lamports())
            .unwrap();
        **listing_info.lamports.borrow_mut() = 0;
        listing_info.assign(&anchor_lang::solana_program::system_program::ID);
        listing_info.realloc(0, false)?;

        Ok(())
    }

    /// Cancel a listing (seller only, auctions only if no bids)
    ///
    /// For WNS/Token-2022: client MUST include WNS `approve_transfer` (amount=0)
    /// remaining_accounts: same layout as list_item
    pub fn cancel_listing<'info>(ctx: Context<'_, '_, '_, 'info, CancelListing<'info>>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;

        require!(
            ctx.accounts.seller.key() == listing.seller,
            AuctionError::Unauthorized
        );

        if matches!(listing.listing_type, ListingType::Auction) {
            require!(
                listing.current_bid == 0,
                AuctionError::CannotCancelWithBids
            );
        }

        // Return NFT: escrow → seller
        let escrow_bump = ctx.bumps.escrow_nft;
        let nft_mint_key = listing.nft_mint;
        let escrow_seeds: &[&[u8]] = &[
            b"escrow_nft",
            nft_mint_key.as_ref(),
            &[escrow_bump],
        ];

        if listing.is_token2022 {
            // Token-2022 with transfer hook: escrow → seller (cancel)
            transfer_checked_with_hook(
                &ctx.accounts.nft_token_program.to_account_info(),
                &ctx.accounts.escrow_nft.to_account_info(),
                &ctx.accounts.nft_mint.to_account_info(),
                &ctx.accounts.seller_nft_account.to_account_info(),
                &ctx.accounts.escrow_nft.to_account_info(),
                ctx.remaining_accounts,
                1,
                0,
                &[escrow_seeds],
            )?;
        } else {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.nft_token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_nft.to_account_info(),
                        to: ctx.accounts.seller_nft_account.to_account_info(),
                        authority: ctx.accounts.escrow_nft.to_account_info(),
                    },
                    &[escrow_seeds],
                ),
                1,
            )?;
        }

        emit!(ListingCancelled {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
        });

        // Close escrow_nft token account via CPI, return rent to seller
        close_token_account_cpi(
            &ctx.accounts.nft_token_program.to_account_info(),
            &ctx.accounts.escrow_nft.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            &ctx.accounts.escrow_nft.to_account_info(),
            &[escrow_seeds],
        )?;

        // Close listing account (owned by our program), return rent to seller
        let listing_info = ctx.accounts.listing.to_account_info();
        let seller_info = ctx.accounts.seller.to_account_info();
        let dest_starting_lamports = seller_info.lamports();
        **seller_info.lamports.borrow_mut() = dest_starting_lamports
            .checked_add(listing_info.lamports())
            .unwrap();
        **listing_info.lamports.borrow_mut() = 0;
        listing_info.assign(&anchor_lang::solana_program::system_program::ID);
        listing_info.realloc(0, false)?;

        Ok(())
    }

    /// Settle an auction after end time
    ///
    /// For WNS/Token-2022: client MUST include WNS `approve_transfer` (amount=0)
    /// remaining_accounts: same layout as list_item
    pub fn settle_auction<'info>(ctx: Context<'_, '_, '_, 'info, SettleAuction<'info>>) -> Result<()> {
        // Resolve treasury address: use config PDA if initialized, else fallback
        let treasury_address = if let Some(ref config) = ctx.accounts.treasury_config {
            config.treasury
        } else {
            TREASURY_FALLBACK.parse::<anchor_lang::prelude::Pubkey>().unwrap()
        };
        require!(
            ctx.accounts.treasury_payment_account.owner == treasury_address,
            AuctionError::Unauthorized
        );
        require!(
            ctx.accounts.treasury.key() == treasury_address,
            AuctionError::Unauthorized
        );

        let listing = &mut ctx.accounts.listing;
        let clock = Clock::get()?;

        require!(
            matches!(listing.listing_type, ListingType::Auction),
            AuctionError::NotAnAuction
        );
        require!(
            listing.status == ListingStatus::Active,
            AuctionError::ListingNotActive
        );
        require!(
            clock.unix_timestamp >= listing.end_time,
            AuctionError::AuctionNotEnded
        );

        let bid_escrow_bump = ctx.bumps.bid_escrow;
        let nft_mint_key = listing.nft_mint;
        let escrow_bump = ctx.bumps.escrow_nft;

        if listing.current_bid > 0 {
            // Validate buyer_nft_account is owned by the highest bidder
            // (prevents redirecting the NFT to an attacker's account)
            let buyer_nft_owner = ctx.accounts.buyer_nft_account.owner;
            require!(
                buyer_nft_owner == listing.highest_bidder,
                AuctionError::InvalidBuyerAccount
            );

            // Auction has bids: distribute payments + transfer NFT to winner
            // Checked arithmetic to prevent overflow
            let platform_fee = listing.current_bid
                .checked_mul(200)
                .and_then(|x| x.checked_div(10000))
                .ok_or(AuctionError::CalculationError)?; // 2%
            let baxus_fee = if listing.baxus_fee {
                listing.current_bid
                    .checked_mul(1000)
                    .and_then(|x| x.checked_div(10000))
                    .ok_or(AuctionError::CalculationError)? // 10%
            } else {
                0u64
            };
            let creator_royalty = listing.current_bid
                .checked_mul(listing.royalty_basis_points as u64)
                .and_then(|x| x.checked_div(10000))
                .ok_or(AuctionError::CalculationError)?;

            // Royalty floor: must be 0 or at least 1% (100 bps) to prevent rounding-to-zero bypass
            require!(
                listing.royalty_basis_points == 0 || listing.royalty_basis_points >= 100,
                AuctionError::InvalidRoyaltyBps
            );

            // Validate creator_payment_account when royalty > 0 (prevents royalty redirection)
            if creator_royalty > 0 {
                let expected_creator_ata = anchor_spl::associated_token::get_associated_token_address(
                    &listing.creator_address,
                    &listing.payment_mint,
                );
                require!(
                    ctx.accounts.creator_payment_account.key() == expected_creator_ata,
                    AuctionError::InvalidCreatorAccount
                );
            }

            // Mark settled BEFORE transfers (checks-effects-interactions — prevents reentrancy)
            listing.status = ListingStatus::Settled;

            let seller_amount = listing
                .current_bid
                .checked_sub(platform_fee)
                .ok_or(AuctionError::CalculationError)?
                .checked_sub(baxus_fee)
                .ok_or(AuctionError::CalculationError)?
                .checked_sub(creator_royalty)
                .ok_or(AuctionError::CalculationError)?;

            let bid_escrow_seeds: &[&[&[u8]]] = &[&[
                b"bid_escrow",
                nft_mint_key.as_ref(),
                &[bid_escrow_bump],
            ]];

            // Payment: bid_escrow → seller
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.bid_escrow.to_account_info(),
                        to: ctx.accounts.seller_payment_account.to_account_info(),
                        authority: ctx.accounts.bid_escrow.to_account_info(),
                    },
                    bid_escrow_seeds,
                ),
                seller_amount,
            )?;

            // Payment: bid_escrow → treasury
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.bid_escrow.to_account_info(),
                        to: ctx.accounts.treasury_payment_account.to_account_info(),
                        authority: ctx.accounts.bid_escrow.to_account_info(),
                    },
                    bid_escrow_seeds,
                ),
                platform_fee + baxus_fee,
            )?;

            // Creator royalty — always enforced
            if creator_royalty > 0 {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.bid_escrow.to_account_info(),
                            to: ctx.accounts.creator_payment_account.to_account_info(),
                            authority: ctx.accounts.bid_escrow.to_account_info(),
                        },
                        bid_escrow_seeds,
                    ),
                    creator_royalty,
                )?;
            }

            // Transfer NFT: escrow → winner
            let nft_escrow_seeds: &[&[u8]] = &[
                b"escrow_nft",
                nft_mint_key.as_ref(),
                &[escrow_bump],
            ];

            if listing.is_token2022 {
                // Token-2022 with transfer hook: escrow → winner
                transfer_checked_with_hook(
                    &ctx.accounts.nft_token_program.to_account_info(),
                    &ctx.accounts.escrow_nft.to_account_info(),
                    &ctx.accounts.nft_mint.to_account_info(),
                    &ctx.accounts.buyer_nft_account.to_account_info(),
                    &ctx.accounts.escrow_nft.to_account_info(),
                    ctx.remaining_accounts,
                    1,
                    0,
                    &[nft_escrow_seeds],
                )?;
            } else {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.nft_token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.escrow_nft.to_account_info(),
                            to: ctx.accounts.buyer_nft_account.to_account_info(),
                            authority: ctx.accounts.escrow_nft.to_account_info(),
                        },
                        &[nft_escrow_seeds],
                    ),
                    1,
                )?;
            }

            emit!(AuctionSettled {
                nft_mint: listing.nft_mint,
                winner: listing.highest_bidder,
                price: listing.current_bid,
                platform_fee,
            });
        } else {
            // No bids: return NFT to seller
            // Validate seller_nft_account is owned by the seller
            let seller_nft_owner = ctx.accounts.seller_nft_account.owner;
            require!(
                seller_nft_owner == listing.seller,
                AuctionError::Unauthorized
            );

            let nft_escrow_seeds: &[&[u8]] = &[
                b"escrow_nft",
                nft_mint_key.as_ref(),
                &[escrow_bump],
            ];

            if listing.is_token2022 {
                // Token-2022 with transfer hook: escrow → seller (no bids)
                transfer_checked_with_hook(
                    &ctx.accounts.nft_token_program.to_account_info(),
                    &ctx.accounts.escrow_nft.to_account_info(),
                    &ctx.accounts.nft_mint.to_account_info(),
                    &ctx.accounts.seller_nft_account.to_account_info(),
                    &ctx.accounts.escrow_nft.to_account_info(),
                    ctx.remaining_accounts,
                    1,
                    0,
                    &[nft_escrow_seeds],
                )?;
            } else {
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.nft_token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.escrow_nft.to_account_info(),
                            to: ctx.accounts.seller_nft_account.to_account_info(),
                            authority: ctx.accounts.escrow_nft.to_account_info(),
                        },
                        &[nft_escrow_seeds],
                    ),
                    1,
                )?;
            }

            listing.status = ListingStatus::Cancelled;

            emit!(AuctionCancelled {
                nft_mint: listing.nft_mint,
                reason: "No bids received".to_string(),
            });
        }

        // Rent destination: treasury on sale, seller on no-bid cancel
        let rent_dest = if listing.status == ListingStatus::Settled {
            ctx.accounts.treasury.to_account_info()
        } else {
            ctx.accounts.seller.to_account_info()
        };

        // Close escrow_nft token account via CPI
        let close_escrow_seeds: &[&[u8]] = &[
            b"escrow_nft",
            nft_mint_key.as_ref(),
            &[escrow_bump],
        ];
        close_token_account_cpi(
            &ctx.accounts.nft_token_program.to_account_info(),
            &ctx.accounts.escrow_nft.to_account_info(),
            &rent_dest,
            &ctx.accounts.escrow_nft.to_account_info(),
            &[close_escrow_seeds],
        )?;

        // Close bid_escrow token account if it exists and is empty
        if ctx.accounts.bid_escrow.amount == 0 {
            let bid_escrow_close_seeds: &[&[&[u8]]] = &[&[
                b"bid_escrow",
                nft_mint_key.as_ref(),
                &[bid_escrow_bump],
            ]];
            token::close_account(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    CloseAccount {
                        account: ctx.accounts.bid_escrow.to_account_info(),
                        destination: rent_dest.clone(),
                        authority: ctx.accounts.bid_escrow.to_account_info(),
                    },
                    bid_escrow_close_seeds,
                ),
            )?;
        }

        // Close listing account (owned by our program)
        let listing_info = ctx.accounts.listing.to_account_info();
        let dest_starting_lamports = rent_dest.lamports();
        **rent_dest.lamports.borrow_mut() = dest_starting_lamports
            .checked_add(listing_info.lamports())
            .unwrap();
        **listing_info.lamports.borrow_mut() = 0;
        listing_info.assign(&anchor_lang::solana_program::system_program::ID);
        listing_info.realloc(0, false)?;

        Ok(())
    }

    /// List a pNFT (Metaplex programmable NFT) for sale.
    /// Uses Token Metadata TransferV1 CPI with delegate + token_record.
    pub fn list_item_pnft<'info>(
        ctx: Context<'_, '_, '_, 'info, ListItemPnft<'info>>,
        listing_type: ListingType,
        price: u64,
        duration_seconds: Option<i64>,
        category: ItemCategory,
        royalty_basis_points: u16,
        creator_address: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let listing = &mut ctx.accounts.listing;

        require!(price > 0, AuctionError::InvalidPrice);
        require!(royalty_basis_points <= 1000, AuctionError::RoyaltyTooHigh);
        validate_category_and_payment(&category, ctx.accounts.payment_mint.key())?;

        if matches!(listing_type, ListingType::Auction) {
            require!(
                duration_seconds.is_some() && duration_seconds.unwrap() > 0,
                AuctionError::InvalidDuration
            );
        }

        listing.seller = ctx.accounts.seller.key();
        listing.nft_mint = ctx.accounts.nft_mint.key();
        listing.payment_mint = ctx.accounts.payment_mint.key();
        listing.price = price;
        listing.listing_type = listing_type;
        listing.category = category;
        listing.start_time = clock.unix_timestamp;
        listing.end_time = if let Some(d) = duration_seconds { clock.unix_timestamp + d } else { 0 };
        listing.status = ListingStatus::Active;
        listing.escrow_nft_account = ctx.accounts.escrow_nft_token.key();
        listing.current_bid = 0;
        listing.highest_bidder = Pubkey::default();
        listing.baxus_fee = false;
        listing.is_token2022 = false;
        listing.is_pnft = true;
        listing.royalty_basis_points = royalty_basis_points;
        listing.creator_address = creator_address;
        listing.bump = ctx.bumps.listing;

        // Transfer pNFT from seller to escrow via Token Metadata TransferV1 raw CPI
        transfer_pnft(
            &ctx.accounts.token_metadata_program.to_account_info(),
            &ctx.accounts.seller_nft_token.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            &ctx.accounts.escrow_nft_token.to_account_info(),
            &ctx.accounts.escrow_authority.to_account_info(),
            &ctx.accounts.nft_mint.to_account_info(),
            &ctx.accounts.nft_metadata.to_account_info(),
            &ctx.accounts.nft_edition.to_account_info(),
            &ctx.accounts.seller_token_record.to_account_info(),
            &ctx.accounts.escrow_token_record.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.sysvar_instructions.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.ata_program.to_account_info(),
            ctx.accounts.authorization_rules_program.as_ref().map(|a| a.as_ref() as &AccountInfo),
            ctx.accounts.authorization_rules.as_ref().map(|a| a.as_ref() as &AccountInfo),
            &[],
        )?;

        emit!(ListingCreated {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
            listing_type,
            price,
            category,
            end_time: listing.end_time,
            payment_mint: listing.payment_mint,
        });

        Ok(())
    }

    /// Buy a fixed-price pNFT listing.
    pub fn buy_now_pnft<'info>(
        ctx: Context<'_, '_, '_, 'info, BuyNowPnft<'info>>
    ) -> Result<()> {
        let listing = &mut ctx.accounts.listing;

        require!(matches!(listing.listing_type, ListingType::FixedPrice), AuctionError::NotFixedPrice);
        require!(listing.status == ListingStatus::Active, AuctionError::ListingNotActive);
        require!(listing.is_pnft, AuctionError::InvalidTokenProgram);

        let treasury_address = if let Some(ref config) = ctx.accounts.treasury_config {
            config.treasury
        } else {
            TREASURY_FALLBACK.parse::<Pubkey>().unwrap()
        };
        require!(ctx.accounts.treasury_payment_account.owner == treasury_address, AuctionError::Unauthorized);
        require!(ctx.accounts.treasury.key() == treasury_address, AuctionError::Unauthorized);

        let platform_fee = listing.price.checked_mul(200).and_then(|x| x.checked_div(10000)).ok_or(AuctionError::CalculationError)?;
        let creator_royalty = listing.price.checked_mul(listing.royalty_basis_points as u64).and_then(|x| x.checked_div(10000)).ok_or(AuctionError::CalculationError)?;
        require!(listing.royalty_basis_points == 0 || listing.royalty_basis_points >= 100, AuctionError::InvalidRoyaltyBps);

        if creator_royalty > 0 {
            let expected_creator_ata = anchor_spl::associated_token::get_associated_token_address(&listing.creator_address, &listing.payment_mint);
            require!(ctx.accounts.creator_payment_account.key() == expected_creator_ata, AuctionError::InvalidCreatorAccount);
        }

        listing.status = ListingStatus::Settled;

        let seller_amount = listing.price.checked_sub(platform_fee).ok_or(AuctionError::CalculationError)?.checked_sub(creator_royalty).ok_or(AuctionError::CalculationError)?;

        // Payment transfers
        token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
            from: ctx.accounts.buyer_payment_account.to_account_info(),
            to: ctx.accounts.seller_payment_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        }), seller_amount)?;

        token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
            from: ctx.accounts.buyer_payment_account.to_account_info(),
            to: ctx.accounts.treasury_payment_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        }), platform_fee)?;

        if creator_royalty > 0 {
            token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
                from: ctx.accounts.buyer_payment_account.to_account_info(),
                to: ctx.accounts.creator_payment_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            }), creator_royalty)?;
        }

        // Transfer pNFT escrow → buyer via Token Metadata TransferV1 raw CPI
        let nft_mint_key = listing.nft_mint;
        let escrow_auth_bump = ctx.bumps.escrow_authority;
        let escrow_auth_seeds: &[&[u8]] = &[b"escrow_authority", nft_mint_key.as_ref(), &[escrow_auth_bump]];

        transfer_pnft(
            &ctx.accounts.token_metadata_program.to_account_info(),
            &ctx.accounts.escrow_nft_token.to_account_info(),
            &ctx.accounts.escrow_authority.to_account_info(),
            &ctx.accounts.buyer_nft_token.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.nft_mint.to_account_info(),
            &ctx.accounts.nft_metadata.to_account_info(),
            &ctx.accounts.nft_edition.to_account_info(),
            &ctx.accounts.escrow_token_record.to_account_info(),
            &ctx.accounts.buyer_token_record.to_account_info(),
            &ctx.accounts.escrow_authority.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.sysvar_instructions.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.ata_program.to_account_info(),
            ctx.accounts.authorization_rules_program.as_ref().map(|a| a.as_ref() as &AccountInfo),
            ctx.accounts.authorization_rules.as_ref().map(|a| a.as_ref() as &AccountInfo),
            &[escrow_auth_seeds],
        )?;

        emit!(ItemPurchased {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
            buyer: ctx.accounts.buyer.key(),
            price: listing.price,
            platform_fee,
            creator_royalty,
        });

        // Close listing — rent to treasury
        let listing_info = ctx.accounts.listing.to_account_info();
        let treasury_info = ctx.accounts.treasury.to_account_info();
        **treasury_info.lamports.borrow_mut() = treasury_info.lamports().checked_add(listing_info.lamports()).unwrap();
        **listing_info.lamports.borrow_mut() = 0;
        listing_info.assign(&anchor_lang::solana_program::system_program::ID);
        listing_info.realloc(0, false)?;

        Ok(())
    }

    /// Cancel a pNFT listing — return NFT to seller.
    pub fn cancel_listing_pnft<'info>(
        ctx: Context<'_, '_, '_, 'info, CancelListingPnft<'info>>
    ) -> Result<()> {
        let listing = &mut ctx.accounts.listing;

        require!(ctx.accounts.seller.key() == listing.seller, AuctionError::Unauthorized);
        require!(listing.is_pnft, AuctionError::InvalidTokenProgram);
        if matches!(listing.listing_type, ListingType::Auction) {
            require!(listing.current_bid == 0, AuctionError::CannotCancelWithBids);
        }

        let nft_mint_key = listing.nft_mint;
        let escrow_auth_bump = ctx.bumps.escrow_authority;
        let escrow_auth_seeds: &[&[u8]] = &[b"escrow_authority", nft_mint_key.as_ref(), &[escrow_auth_bump]];

        // Transfer pNFT escrow → seller via Token Metadata TransferV1 raw CPI
        transfer_pnft(
            &ctx.accounts.token_metadata_program.to_account_info(),
            &ctx.accounts.escrow_nft_token.to_account_info(),
            &ctx.accounts.escrow_authority.to_account_info(),
            &ctx.accounts.seller_nft_token.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            &ctx.accounts.nft_mint.to_account_info(),
            &ctx.accounts.nft_metadata.to_account_info(),
            &ctx.accounts.nft_edition.to_account_info(),
            &ctx.accounts.escrow_token_record.to_account_info(),
            &ctx.accounts.seller_token_record.to_account_info(),
            &ctx.accounts.escrow_authority.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.sysvar_instructions.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.ata_program.to_account_info(),
            ctx.accounts.authorization_rules_program.as_ref().map(|a| a.as_ref() as &AccountInfo),
            ctx.accounts.authorization_rules.as_ref().map(|a| a.as_ref() as &AccountInfo),
            &[escrow_auth_seeds],
        )?;

        emit!(ListingCancelled { nft_mint: listing.nft_mint, seller: listing.seller });

        // Close listing — rent to seller
        let listing_info = ctx.accounts.listing.to_account_info();
        let seller_info = ctx.accounts.seller.to_account_info();
        **seller_info.lamports.borrow_mut() = seller_info.lamports().checked_add(listing_info.lamports()).unwrap();
        **listing_info.lamports.borrow_mut() = 0;
        listing_info.assign(&anchor_lang::solana_program::system_program::ID);
        listing_info.realloc(0, false)?;

        Ok(())
    }

    /// Close a stale listing where escrow is empty (NFT already returned)
    /// This allows re-listing the same NFT after a cancelled listing
    pub fn close_stale_listing(ctx: Context<CloseStaleListing>) -> Result<()> {
        let listing = &ctx.accounts.listing;

        // Only the original seller can close their stale listing
        require!(
            ctx.accounts.seller.key() == listing.seller,
            AuctionError::Unauthorized
        );

        // Verify escrow is empty (NFT already returned)
        require!(
            ctx.accounts.escrow_nft.amount == 0,
            AuctionError::ListingNotActive // reuse: listing still has NFT
        );

        emit!(ListingCancelled {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
        });

        // Close escrow_nft token account via CPI, return rent to seller
        let nft_mint_key = listing.nft_mint;
        let escrow_bump = ctx.bumps.escrow_nft;
        let close_escrow_seeds: &[&[u8]] = &[
            b"escrow_nft",
            nft_mint_key.as_ref(),
            &[escrow_bump],
        ];
        close_token_account_cpi(
            &ctx.accounts.nft_token_program.to_account_info(),
            &ctx.accounts.escrow_nft.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            &ctx.accounts.escrow_nft.to_account_info(),
            &[close_escrow_seeds],
        )?;

        // Close listing account (owned by our program)
        let listing_info = ctx.accounts.listing.to_account_info();
        let seller_info = ctx.accounts.seller.to_account_info();
        let dest_starting_lamports = seller_info.lamports();
        **seller_info.lamports.borrow_mut() = dest_starting_lamports
            .checked_add(listing_info.lamports())
            .unwrap();
        **listing_info.lamports.borrow_mut() = 0;
        listing_info.assign(&anchor_lang::solana_program::system_program::ID);
        listing_info.realloc(0, false)?;

        Ok(())
    }

    // ========================================================================
    // Metaplex Core listing flow (Artifacte v2)
    //
    // Non-custodial: the asset stays in the seller's wallet during listing.
    // The program is approved as a TransferDelegate plugin authority via
    // mpl-core CPI; on buy, the program signs the TransferV1 CPI as that
    // delegate, transferring the asset directly from seller to buyer.
    //
    // Constraints:
    //   - Current asset holder may list.
    //   - Asset must belong to ARTIFACTE_COLLECTION.
    //   - Payment mint must be USDC.
    //   - 2% platform fee + creator royalty (from on-chain Royalties plugin)
    //     routed to the configured treasury / royalty creator (= treasury);
    //     remainder to the seller.
    // ========================================================================

    /// List a Metaplex Core asset for fixed-price USDC sale.
    pub fn list_core_item(ctx: Context<ListCoreItem>, price_usdc: u64) -> Result<()> {
        // Artifacte collection only
        require!(
            ctx.accounts.collection.key().to_string() == ARTIFACTE_COLLECTION_ID,
            AuctionError::Unauthorized
        );
        // USDC only
        require!(
            ctx.accounts.payment_mint.key().to_string() == USDC_MINT,
            AuctionError::InvalidPaymentMint
        );
        require!(price_usdc > 0, AuctionError::InvalidPrice);

        // Verify the seller owns the Core asset, and the asset belongs to the collection.
        verify_core_asset_ownership(
            &ctx.accounts.asset.to_account_info(),
            ctx.accounts.seller.key(),
            ctx.accounts.collection.key(),
        )?;

        let clock = Clock::get()?;
        let listing = &mut ctx.accounts.core_listing;
        listing.seller = ctx.accounts.seller.key();
        listing.asset = ctx.accounts.asset.key();
        listing.collection = ctx.accounts.collection.key();
        listing.payment_mint = ctx.accounts.payment_mint.key();
        listing.price = price_usdc;
        listing.created_at = clock.unix_timestamp;
        listing.bump = ctx.bumps.core_listing;

        let expected_transfer_delegate_authority = mpl_core::types::PluginAuthority::Address {
            address: ctx.accounts.core_authority.key(),
        };

        match read_core_transfer_delegate_state(&ctx.accounts.asset.to_account_info())? {
            CoreTransferDelegateState::Missing => {
                mpl_core::instructions::AddPluginV1Cpi {
                    __program: &ctx.accounts.mpl_core_program.to_account_info(),
                    asset: &ctx.accounts.asset.to_account_info(),
                    collection: Some(&ctx.accounts.collection.to_account_info()),
                    payer: &ctx.accounts.seller.to_account_info(),
                    authority: Some(&ctx.accounts.seller.to_account_info()),
                    system_program: &ctx.accounts.system_program.to_account_info(),
                    log_wrapper: None,
                    __args: mpl_core::instructions::AddPluginV1InstructionArgs {
                        plugin: mpl_core::types::Plugin::TransferDelegate(
                            mpl_core::types::TransferDelegate {},
                        ),
                        init_authority: Some(expected_transfer_delegate_authority.clone()),
                    },
                }
                .invoke()?;
            }
            CoreTransferDelegateState::Address(address)
                if address == ctx.accounts.core_authority.key() => {}
            CoreTransferDelegateState::Address(_) | CoreTransferDelegateState::Other => {
                mpl_core::instructions::ApprovePluginAuthorityV1Cpi {
                    __program: &ctx.accounts.mpl_core_program.to_account_info(),
                    asset: &ctx.accounts.asset.to_account_info(),
                    collection: Some(&ctx.accounts.collection.to_account_info()),
                    payer: &ctx.accounts.seller.to_account_info(),
                    authority: Some(&ctx.accounts.seller.to_account_info()),
                    system_program: &ctx.accounts.system_program.to_account_info(),
                    log_wrapper: None,
                    __args: mpl_core::instructions::ApprovePluginAuthorityV1InstructionArgs {
                        plugin_type: mpl_core::types::PluginType::TransferDelegate,
                        new_authority: expected_transfer_delegate_authority,
                    },
                }
                .invoke()?;
            }
        }

        emit!(CoreListingCreated {
            asset: listing.asset,
            seller: listing.seller,
            price_usdc,
            payment_mint: listing.payment_mint,
        });
        Ok(())
    }

    /// Cancel an active Core listing while the seller still holds the asset.
    pub fn cancel_core_listing(ctx: Context<CancelCoreListing>) -> Result<()> {
        // Only the original seller (= owner) may cancel
        require!(
            ctx.accounts.seller.key() == ctx.accounts.core_listing.seller,
            AuctionError::Unauthorized
        );
        verify_active_core_listing_owner(
            &ctx.accounts.asset.to_account_info(),
            ctx.accounts.core_listing.seller,
            ctx.accounts.collection.key(),
        )?;

        mpl_core::instructions::RevokePluginAuthorityV1Cpi {
            __program: &ctx.accounts.mpl_core_program.to_account_info(),
            asset: &ctx.accounts.asset.to_account_info(),
            collection: Some(&ctx.accounts.collection.to_account_info()),
            payer: &ctx.accounts.seller.to_account_info(),
            authority: Some(&ctx.accounts.seller.to_account_info()),
            system_program: &ctx.accounts.system_program.to_account_info(),
            log_wrapper: None,
            __args: mpl_core::instructions::RevokePluginAuthorityV1InstructionArgs {
                plugin_type: mpl_core::types::PluginType::TransferDelegate,
            },
        }
        .invoke()?;

        emit!(CoreListingCancelled {
            asset: ctx.accounts.core_listing.asset,
            seller: ctx.accounts.core_listing.seller,
        });
        // CoreListing PDA closed via `close = seller` constraint.
        Ok(())
    }

    /// Close a stale Core listing after ownership changed outside the program.
    /// Allows the current holder to clear old state and re-list the asset.
    pub fn close_stale_core_listing(ctx: Context<CloseStaleCoreListing>) -> Result<()> {
        let listing = &ctx.accounts.core_listing;
        let (asset_owner, asset_collection) =
            read_core_asset_owner_and_collection(&ctx.accounts.asset.to_account_info())?;

        require_keys_eq!(asset_collection, ctx.accounts.collection.key(), AuctionError::Unauthorized);
        require_keys_eq!(asset_owner, ctx.accounts.holder.key(), AuctionError::Unauthorized);
        require!(listing.seller != ctx.accounts.holder.key(), AuctionError::CoreListingNotStale);

        match read_core_transfer_delegate_state(&ctx.accounts.asset.to_account_info())? {
            CoreTransferDelegateState::Address(address)
                if address == ctx.accounts.core_authority.key() =>
            {
                mpl_core::instructions::RevokePluginAuthorityV1Cpi {
                    __program: &ctx.accounts.mpl_core_program.to_account_info(),
                    asset: &ctx.accounts.asset.to_account_info(),
                    collection: Some(&ctx.accounts.collection.to_account_info()),
                    payer: &ctx.accounts.holder.to_account_info(),
                    authority: Some(&ctx.accounts.holder.to_account_info()),
                    system_program: &ctx.accounts.system_program.to_account_info(),
                    log_wrapper: None,
                    __args: mpl_core::instructions::RevokePluginAuthorityV1InstructionArgs {
                        plugin_type: mpl_core::types::PluginType::TransferDelegate,
                    },
                }
                .invoke()?;
            }
            _ => {}
        }

        emit!(CoreListingCancelled {
            asset: listing.asset,
            seller: listing.seller,
        });

        Ok(())
    }

    /// Public buy of a Core listing. Splits USDC (platform fee + royalty +
    /// remainder), then CPIs TransferV1 to move the asset to the buyer.
    pub fn buy_now_core(ctx: Context<BuyNowCore>) -> Result<()> {
        let listing = &ctx.accounts.core_listing;

        // Re-validate state (defence in depth)
        require!(listing.payment_mint.to_string() == USDC_MINT, AuctionError::InvalidPaymentMint);
        require!(
            ctx.accounts.payment_mint.key() == listing.payment_mint,
            AuctionError::InvalidPaymentMint
        );
        require!(
            ctx.accounts.asset.key() == listing.asset,
            AuctionError::Unauthorized
        );
        require!(
            ctx.accounts.collection.key() == listing.collection,
            AuctionError::Unauthorized
        );
        verify_active_core_listing_owner(
            &ctx.accounts.asset.to_account_info(),
            listing.seller,
            ctx.accounts.collection.key(),
        )?;

        // Resolve treasury (config PDA if initialized, else fallback constant)
        let treasury_address = if let Some(ref config) = ctx.accounts.treasury_config {
            config.treasury
        } else {
            TREASURY_FALLBACK.parse::<Pubkey>().unwrap()
        };
        require!(
            ctx.accounts.treasury_payment_account.owner == treasury_address,
            AuctionError::Unauthorized
        );
        require!(
            ctx.accounts.treasury.key() == treasury_address,
            AuctionError::Unauthorized
        );
        require!(
            ctx.accounts.seller_payment_account.owner == listing.seller,
            AuctionError::Unauthorized
        );

        // Read on-chain Royalties plugin (asset first, fallback to collection)
        // and validate creator_payment_account.
        let (royalty_bps, royalty_creator) = read_core_royalties(
            &ctx.accounts.asset.to_account_info(),
            &ctx.accounts.collection.to_account_info(),
        )?;
        require!(royalty_bps <= 1000, AuctionError::RoyaltyTooHigh);

        let platform_fee = listing
            .price
            .checked_mul(200)
            .and_then(|x| x.checked_div(10000))
            .ok_or(AuctionError::CalculationError)?;
        let creator_royalty = listing
            .price
            .checked_mul(royalty_bps as u64)
            .and_then(|x| x.checked_div(10000))
            .ok_or(AuctionError::CalculationError)?;

        if creator_royalty > 0 {
            let expected_creator_ata =
                anchor_spl::associated_token::get_associated_token_address(
                    &royalty_creator,
                    &listing.payment_mint,
                );
            require!(
                ctx.accounts.creator_payment_account.key() == expected_creator_ata,
                AuctionError::InvalidCreatorAccount
            );
        }

        let seller_amount = listing
            .price
            .checked_sub(platform_fee)
            .ok_or(AuctionError::CalculationError)?
            .checked_sub(creator_royalty)
            .ok_or(AuctionError::CalculationError)?;

        // USDC: buyer → seller
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_payment_account.to_account_info(),
                    to: ctx.accounts.seller_payment_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            seller_amount,
        )?;
        // USDC: buyer → treasury (platform fee)
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_payment_account.to_account_info(),
                    to: ctx.accounts.treasury_payment_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            platform_fee,
        )?;
        if creator_royalty > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer_payment_account.to_account_info(),
                        to: ctx.accounts.creator_payment_account.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                creator_royalty,
            )?;
        }

        // Transfer the Core asset (signed by the program's delegate PDA)
        let asset_key = ctx.accounts.asset.key();
        let core_authority_bump = ctx.bumps.core_authority;
        let core_authority_seeds: &[&[u8]] = &[
            b"core_authority",
            asset_key.as_ref(),
            &[core_authority_bump],
        ];

        mpl_core::instructions::TransferV1Cpi {
            __program: &ctx.accounts.mpl_core_program.to_account_info(),
            asset: &ctx.accounts.asset.to_account_info(),
            collection: Some(&ctx.accounts.collection.to_account_info()),
            payer: &ctx.accounts.buyer.to_account_info(),
            authority: Some(&ctx.accounts.core_authority.to_account_info()),
            new_owner: &ctx.accounts.buyer.to_account_info(),
            system_program: Some(&ctx.accounts.system_program.to_account_info()),
            log_wrapper: None,
            __args: mpl_core::instructions::TransferV1InstructionArgs {
                compression_proof: None,
            },
        }
        .invoke_signed(&[core_authority_seeds])?;

        emit!(CorePurchased {
            asset: listing.asset,
            seller: listing.seller,
            buyer: ctx.accounts.buyer.key(),
            price_usdc: listing.price,
            platform_fee,
            creator_royalty,
        });
        // CoreListing PDA closed via `close = seller` constraint.
        Ok(())
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn validate_category_and_payment(category: &ItemCategory, payment_mint: Pubkey) -> Result<()> {
    let payment_str = payment_mint.to_string();
    
    match category {
        ItemCategory::DigitalArt => {
            require!(
                payment_str == SOL_MINT,
                AuctionError::InvalidPaymentMint
            );
        }
        ItemCategory::Spirits
        | ItemCategory::TCGCards
        | ItemCategory::SportsCards
        | ItemCategory::Watches => {
            // USDC-only — USD1 removed per Artifacte v2 workflow.
            require!(
                payment_str == USDC_MINT,
                AuctionError::InvalidPaymentMint
            );
        }
    }
    
    Ok(())
}

// ============================================================================
// Instructions
// ============================================================================

#[derive(Accounts)]
#[instruction(listing_type: ListingType, price: u64, duration_seconds: Option<i64>, category: ItemCategory, royalty_basis_points: u16, creator_address: Pubkey)]
pub struct ListItem<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", nft_mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,
    pub nft_mint: InterfaceAccount<'info, IfaceMint>,
    pub payment_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(
        init_if_needed,
        payer = seller,
        token::mint = nft_mint,
        token::authority = escrow_nft,
        token::token_program = nft_token_program,
        seeds = [b"escrow_nft", nft_mint.key().as_ref()],
        bump,
    )]
    pub escrow_nft: InterfaceAccount<'info, IfaceTokenAccount>,
    #[account(mut)]
    pub seller_nft_account: InterfaceAccount<'info, IfaceTokenAccount>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub nft_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ============================================================================
// pNFT Account Structs
// ============================================================================

#[derive(Accounts)]
#[instruction(listing_type: ListingType, price: u64, duration_seconds: Option<i64>, category: ItemCategory, royalty_basis_points: u16, creator_address: Pubkey)]
pub struct ListItemPnft<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", nft_mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,

    /// CHECK: Mint — verified by Token Metadata CPI program constraints
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: Metaplex metadata PDA — verified by Token Metadata program during CPI
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition PDA — verified by Token Metadata
    pub nft_edition: UncheckedAccount<'info>,

    /// CHECK: Seller NFT token account — verified by Token Metadata CPI
    #[account(mut)]
    pub seller_nft_token: UncheckedAccount<'info>,

    /// CHECK: Seller token record PDA — verified by Token Metadata CPI
    #[account(mut)]
    pub seller_token_record: UncheckedAccount<'info>,

    /// Escrow authority PDA — owns the escrow token account
    #[account(
        seeds = [b"escrow_authority", nft_mint.key().as_ref()],
        bump,
    )]
    pub escrow_authority: SystemAccount<'info>,

    /// Escrow token account — created by Token Metadata via ATA
    #[account(mut)]
    pub escrow_nft_token: UncheckedAccount<'info>,

    /// Escrow token record (pNFT programmable config)
    #[account(mut)]
    pub escrow_token_record: UncheckedAccount<'info>,

    pub payment_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: Metaplex Token Metadata program
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    /// CHECK: SPL Associated Token Account program
    pub ata_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Sysvar instructions
    pub sysvar_instructions: UncheckedAccount<'info>,

    /// CHECK: Optional Metaplex authorization rules program
    pub authorization_rules_program: Option<UncheckedAccount<'info>>,

    /// CHECK: Optional Metaplex authorization rules account
    pub authorization_rules: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct BuyNowPnft<'info> {
    #[account(mut, seeds = [b"listing", nft_mint.key().as_ref()], bump = listing.bump)]
    pub listing: Box<Account<'info, Listing>>,

    /// CHECK: Must match listing.nft_mint — enforced by PDA seed constraint above
    #[account(constraint = nft_mint.key() == listing.nft_mint @ AuctionError::Unauthorized)]
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: Metaplex metadata PDA — verified by Token Metadata program during CPI
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition PDA — verified by Token Metadata
    pub nft_edition: UncheckedAccount<'info>,

    /// Escrow authority PDA
    #[account(
        seeds = [b"escrow_authority", nft_mint.key().as_ref()],
        bump,
    )]
    pub escrow_authority: SystemAccount<'info>,

    /// CHECK: Escrow token account — verified by Token Metadata CPI
    #[account(mut)]
    pub escrow_nft_token: UncheckedAccount<'info>,

    /// CHECK: Escrow token record — verified by Token Metadata CPI
    #[account(mut)]
    pub escrow_token_record: UncheckedAccount<'info>,

    /// CHECK: Buyer NFT token account — verified by Token Metadata CPI
    #[account(mut)]
    pub buyer_nft_token: UncheckedAccount<'info>,

    /// CHECK: Buyer token record — verified by Token Metadata CPI
    #[account(mut)]
    pub buyer_token_record: UncheckedAccount<'info>,

    #[account(mut)]
    pub buyer_payment_account: Account<'info, TokenAccount>,

    #[account(mut, constraint = seller_payment_account.owner == listing.seller @ AuctionError::Unauthorized)]
    pub seller_payment_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_payment_account: Account<'info, TokenAccount>,

    /// CHECK: Creator payment account
    #[account(mut)]
    pub creator_payment_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Treasury wallet
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    #[account(seeds = [b"treasury_config"], bump)]
    pub treasury_config: Option<Account<'info, TreasuryConfig>>,

    /// CHECK: Metaplex Token Metadata program
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    /// CHECK: SPL ATA program
    pub ata_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Sysvar instructions
    pub sysvar_instructions: UncheckedAccount<'info>,

    /// CHECK: Optional authorization rules program
    pub authorization_rules_program: Option<UncheckedAccount<'info>>,

    /// CHECK: Optional authorization rules account
    pub authorization_rules: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct CancelListingPnft<'info> {
    #[account(mut, seeds = [b"listing", nft_mint.key().as_ref()], bump = listing.bump)]
    pub listing: Account<'info, Listing>,

    /// CHECK: Must match listing.nft_mint — enforced by PDA seed constraint above
    #[account(constraint = nft_mint.key() == listing.nft_mint @ AuctionError::Unauthorized)]
    pub nft_mint: UncheckedAccount<'info>,

    /// CHECK: Metaplex metadata PDA — verified by Token Metadata program during CPI
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition PDA — verified by Token Metadata
    pub nft_edition: UncheckedAccount<'info>,

    /// Escrow authority PDA
    #[account(
        seeds = [b"escrow_authority", nft_mint.key().as_ref()],
        bump,
    )]
    pub escrow_authority: SystemAccount<'info>,

    /// CHECK: Escrow token account — verified by Token Metadata CPI
    #[account(mut)]
    pub escrow_nft_token: UncheckedAccount<'info>,

    /// CHECK: Escrow token record — verified by Token Metadata CPI
    #[account(mut)]
    pub escrow_token_record: UncheckedAccount<'info>,

    /// CHECK: Seller NFT token account — verified by Token Metadata CPI
    #[account(mut)]
    pub seller_nft_token: UncheckedAccount<'info>,

    /// CHECK: Seller token record — verified by Token Metadata CPI
    #[account(mut)]
    pub seller_token_record: UncheckedAccount<'info>,

    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: Metaplex Token Metadata program
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    /// CHECK: SPL ATA program
    pub ata_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Sysvar instructions
    pub sysvar_instructions: UncheckedAccount<'info>,

    /// CHECK: Optional authorization rules program
    pub authorization_rules_program: Option<UncheckedAccount<'info>>,

    /// CHECK: Optional authorization rules account
    pub authorization_rules: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    /// Payment mint — must match the listing's payment mint
    #[account(constraint = payment_mint.key() == listing.payment_mint @ AuctionError::InvalidPaymentMint)]
    pub payment_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(
        init_if_needed,
        payer = bidder,
        token::mint = payment_mint,
        token::authority = bid_escrow,
        seeds = [b"bid_escrow", listing.nft_mint.as_ref()],
        bump,
    )]
    pub bid_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = bidder,
    )]
    pub bidder_token_account: Account<'info, TokenAccount>,
    /// CHECK: Only used when refunding previous bidder (current_bid > 0). Validated in instruction body.
    #[account(mut)]
    pub previous_bidder_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyNow<'info> {
    #[account(mut)]
    pub listing: Box<Account<'info, Listing>>,
    pub nft_mint: InterfaceAccount<'info, IfaceMint>,
    #[account(
        mut,
        seeds = [b"escrow_nft", listing.nft_mint.as_ref()],
        bump,
        token::mint = listing.nft_mint,
        token::token_program = nft_token_program,
    )]
    pub escrow_nft: InterfaceAccount<'info, IfaceTokenAccount>,
    #[account(mut)]
    pub buyer_payment_account: Account<'info, TokenAccount>,
    /// Seller payment account — must be owned by listing.seller
    #[account(mut, constraint = seller_payment_account.owner == listing.seller @ AuctionError::Unauthorized)]
    pub seller_payment_account: Account<'info, TokenAccount>,
    /// Treasury payment account — validated in instruction body against treasury_config or fallback
    #[account(mut)]
    pub treasury_payment_account: Account<'info, TokenAccount>,
    /// CHECK: Creator payment account — validated in instruction body
    #[account(mut)]
    pub creator_payment_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub buyer_nft_account: InterfaceAccount<'info, IfaceTokenAccount>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Treasury wallet for rent collection. Validated in instruction body.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    /// Treasury config PDA — if present, overrides hardcoded treasury address
    #[account(
        seeds = [b"treasury_config"],
        bump,
    )]
    pub treasury_config: Option<Account<'info, TreasuryConfig>>,
    pub nft_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    pub nft_mint: InterfaceAccount<'info, IfaceMint>,
    #[account(
        mut,
        seeds = [b"escrow_nft", listing.nft_mint.as_ref()],
        bump,
        token::mint = listing.nft_mint,
        token::token_program = nft_token_program,
    )]
    pub escrow_nft: InterfaceAccount<'info, IfaceTokenAccount>,
    #[account(mut)]
    pub seller_nft_account: InterfaceAccount<'info, IfaceTokenAccount>,
    pub seller: Signer<'info>,
    pub nft_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CloseStaleListing<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    pub nft_mint: InterfaceAccount<'info, IfaceMint>,
    #[account(
        mut,
        seeds = [b"escrow_nft", listing.nft_mint.as_ref()],
        bump,
        token::mint = listing.nft_mint,
        token::token_program = nft_token_program,
    )]
    pub escrow_nft: InterfaceAccount<'info, IfaceTokenAccount>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub nft_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    #[account(mut)]
    pub listing: Box<Account<'info, Listing>>,
    pub nft_mint: Box<InterfaceAccount<'info, IfaceMint>>,
    #[account(
        mut,
        seeds = [b"bid_escrow", listing.nft_mint.as_ref()],
        bump,
        token::mint = listing.payment_mint,
    )]
    pub bid_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [b"escrow_nft", listing.nft_mint.as_ref()],
        bump,
        token::mint = listing.nft_mint,
        token::token_program = nft_token_program,
    )]
    pub escrow_nft: Box<InterfaceAccount<'info, IfaceTokenAccount>>,
    /// Seller's payment token account — must be owned by listing.seller
    #[account(mut, constraint = seller_payment_account.owner == listing.seller @ AuctionError::Unauthorized)]
    pub seller_payment_account: Box<Account<'info, TokenAccount>>,
    /// Treasury payment account — validated in instruction body against treasury_config or fallback
    #[account(mut)]
    pub treasury_payment_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Creator payment account — validated in instruction body if royalty > 0
    #[account(mut)]
    pub creator_payment_account: UncheckedAccount<'info>,
    /// Buyer NFT account — must be owned by highest bidder (or seller if no bids for return)
    #[account(mut)]
    pub buyer_nft_account: Box<InterfaceAccount<'info, IfaceTokenAccount>>,
    /// Seller NFT account — must be owned by listing.seller (for no-bid return)
    #[account(mut)]
    pub seller_nft_account: Box<InterfaceAccount<'info, IfaceTokenAccount>>,
    /// CHECK: The original seller, validated against listing.seller.
    #[account(mut, constraint = seller.key() == listing.seller)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: Treasury wallet for rent collection on sales. Validated in instruction body.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    /// Treasury config PDA — if present, overrides hardcoded treasury address
    #[account(
        seeds = [b"treasury_config"],
        bump,
    )]
    pub treasury_config: Option<Account<'info, TreasuryConfig>>,
    pub nft_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// State
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ListingType {
    FixedPrice,
    Auction,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ItemCategory {
    DigitalArt,
    Spirits,
    TCGCards,
    SportsCards,
    Watches,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ListingStatus {
    Active,
    Settled,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub price: u64,
    pub listing_type: ListingType,
    pub category: ItemCategory,
    pub start_time: i64,
    pub end_time: i64,
    pub status: ListingStatus,
    pub escrow_nft_account: Pubkey,
    pub current_bid: u64,
    pub highest_bidder: Pubkey,
    pub baxus_fee: bool,
    pub is_token2022: bool,
    pub is_pnft: bool,
    pub royalty_basis_points: u16,
    pub creator_address: Pubkey,
    pub bump: u8,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct ListingCreated {
    pub nft_mint: Pubkey,
    pub seller: Pubkey,
    pub listing_type: ListingType,
    pub price: u64,
    pub category: ItemCategory,
    pub end_time: i64,
    pub payment_mint: Pubkey,
}

#[event]
pub struct BidPlaced {
    pub nft_mint: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ItemPurchased {
    pub nft_mint: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub platform_fee: u64,
    pub creator_royalty: u64,
}

#[event]
pub struct AuctionSettled {
    pub nft_mint: Pubkey,
    pub winner: Pubkey,
    pub price: u64,
    pub platform_fee: u64,
}

#[event]
pub struct ListingCancelled {
    pub nft_mint: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct AuctionCancelled {
    pub nft_mint: Pubkey,
    pub reason: String,
}

// ============================================================================
// Treasury Config
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct TreasuryConfig {
    pub treasury: Pubkey,
    pub authority: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TreasuryConfig::INIT_SPACE,
        seeds = [b"treasury_config"],
        bump,
    )]
    pub treasury_config: Account<'info, TreasuryConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    #[account(
        mut,
        seeds = [b"treasury_config"],
        bump = treasury_config.bump,
    )]
    pub treasury_config: Account<'info, TreasuryConfig>,
    pub authority: Signer<'info>,
}

#[event]
pub struct TreasuryUpdated {
    pub old_treasury: Pubkey,
    pub new_treasury: Pubkey,
    pub timestamp: i64,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum AuctionError {
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Auction has already ended")]
    AuctionEnded,
    #[msg("Auction has not ended yet")]
    AuctionNotEnded,
    #[msg("Bid is too low")]
    BidTooLow,
    #[msg("Calculation error")]
    CalculationError,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Cannot cancel auction with existing bids")]
    CannotCancelWithBids,
    #[msg("Invalid listing type for this operation")]
    NotAnAuction,
    #[msg("Invalid listing type for this operation")]
    NotFixedPrice,
    #[msg("Invalid duration for auction")]
    InvalidDuration,
    #[msg("Invalid payment mint for this category")]
    InvalidPaymentMint,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Insufficient WNS remaining accounts for Token-2022 transfer")]
    InsufficientWNSAccounts,
    #[msg("Token-2022 transfer with hook failed")]
    TransferFailed,
    #[msg("Seller cannot bid on their own auction")]
    SellerCannotBid,
    #[msg("Invalid refund account — must be previous bidder's ATA")]
    InvalidRefundAccount,
    #[msg("Royalty basis points too high (max 1000 = 10%)")]
    RoyaltyTooHigh,
    #[msg("Invalid buyer account — must be owned by highest bidder")]
    InvalidBuyerAccount,
    #[msg("Invalid creator account — must be creator's ATA for payment mint")]
    InvalidCreatorAccount,
    #[msg("Invalid token program — must be SPL Token or Token-2022")]
    InvalidTokenProgram,
    #[msg("Invalid royalty basis points — must be 0 or >= 100 (1%)")]
    InvalidRoyaltyBps,
    #[msg("Invalid Metaplex Core plugin state")]
    InvalidCorePluginState,
    #[msg("Core listing is stale because the seller no longer owns the asset")]
    StaleCoreListing,
    #[msg("Core listing is not stale")]
    CoreListingNotStale,
}

// ============================================================================
// Metaplex Core (Artifacte v2) — accounts, state, events, helpers, errors
// ============================================================================

#[derive(Accounts)]
pub struct ListCoreItem<'info> {
    /// Current holder-signed.
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: Metaplex Core asset. Validated in handler against owner + collection.
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core collection. Pubkey validated against ARTIFACTE_COLLECTION_ID in handler.
    #[account(mut)]
    pub collection: UncheckedAccount<'info>,

    /// USDC mint (validated in handler).
    pub payment_mint: Account<'info, anchor_spl::token::Mint>,

    /// CoreListing PDA — created on list, closed on cancel/buy.
    #[account(
        init,
        payer = seller,
        space = 8 + CoreListing::INIT_SPACE,
        seeds = [b"core_listing", asset.key().as_ref()],
        bump,
    )]
    pub core_listing: Account<'info, CoreListing>,

    /// CHECK: Program-controlled PDA that becomes the TransferDelegate authority.
    #[account(
        seeds = [b"core_authority", asset.key().as_ref()],
        bump,
    )]
    pub core_authority: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelCoreListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// CHECK: Metaplex Core asset.
    #[account(mut, address = core_listing.asset)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core collection.
    #[account(mut, address = core_listing.collection)]
    pub collection: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"core_listing", asset.key().as_ref()],
        bump = core_listing.bump,
        close = seller,
    )]
    pub core_listing: Account<'info, CoreListing>,

    /// CHECK: Program-controlled PDA = TransferDelegate authority.
    #[account(
        seeds = [b"core_authority", asset.key().as_ref()],
        bump,
    )]
    pub core_authority: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseStaleCoreListing<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,

    /// CHECK: Metaplex Core asset.
    #[account(mut, address = core_listing.asset)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core collection.
    #[account(mut, address = core_listing.collection)]
    pub collection: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"core_listing", asset.key().as_ref()],
        bump = core_listing.bump,
        close = holder,
    )]
    pub core_listing: Account<'info, CoreListing>,

    /// CHECK: Program-controlled PDA = TransferDelegate authority.
    #[account(
        seeds = [b"core_authority", asset.key().as_ref()],
        bump,
    )]
    pub core_authority: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core program.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyNowCore<'info> {
    /// Public buyer.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Metaplex Core asset.
    #[account(mut, address = core_listing.asset)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Metaplex Core collection.
    #[account(mut, address = core_listing.collection)]
    pub collection: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"core_listing", asset.key().as_ref()],
        bump = core_listing.bump,
        close = seller,
    )]
    pub core_listing: Account<'info, CoreListing>,

    /// CHECK: Original seller — receives PDA rent on close.
    #[account(mut, address = core_listing.seller)]
    pub seller: UncheckedAccount<'info>,

    /// CHECK: Program-controlled PDA = TransferDelegate authority (signs CPI).
    #[account(
        seeds = [b"core_authority", asset.key().as_ref()],
        bump,
    )]
    pub core_authority: UncheckedAccount<'info>,

    /// USDC mint (validated in handler).
    pub payment_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(mut)]
    pub buyer_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_payment_account: Account<'info, TokenAccount>,
    /// CHECK: Royalty creator's payment account — validated against on-chain plugin in handler.
    #[account(mut)]
    pub creator_payment_account: UncheckedAccount<'info>,

    /// CHECK: Treasury wallet — validated in handler against treasury_config or fallback.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    #[account(seeds = [b"treasury_config"], bump)]
    pub treasury_config: Option<Account<'info, TreasuryConfig>>,

    /// CHECK: Metaplex Core program.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct CoreListing {
    pub seller: Pubkey,
    pub asset: Pubkey,
    pub collection: Pubkey,
    pub payment_mint: Pubkey,
    pub price: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[event]
pub struct CoreListingCreated {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub price_usdc: u64,
    pub payment_mint: Pubkey,
}

#[event]
pub struct CoreListingCancelled {
    pub asset: Pubkey,
    pub seller: Pubkey,
}

#[event]
pub struct CorePurchased {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub price_usdc: u64,
    pub platform_fee: u64,
    pub creator_royalty: u64,
}

/// Verify that a Metaplex Core asset is owned by `expected_owner` and belongs
/// to `expected_collection`. Reads the BaseAssetV1 header directly from the
/// account data.
fn read_core_asset_owner_and_collection(asset_account: &AccountInfo) -> Result<(Pubkey, Pubkey)> {
    require_keys_eq!(*asset_account.owner, mpl_core::ID, AuctionError::Unauthorized);
    let data = asset_account.try_borrow_data()?;
    let asset = mpl_core::accounts::BaseAssetV1::from_bytes(&data)
        .map_err(|_| error!(AuctionError::Unauthorized))?;
    let collection = match asset.update_authority {
        mpl_core::types::UpdateAuthority::Collection(collection) => collection,
        _ => return err!(AuctionError::Unauthorized),
    };

    Ok((asset.owner, collection))
}

fn verify_core_asset_ownership(
    asset_account: &AccountInfo,
    expected_owner: Pubkey,
    expected_collection: Pubkey,
) -> Result<()> {
    let (asset_owner, asset_collection) = read_core_asset_owner_and_collection(asset_account)?;
    require_keys_eq!(asset_owner, expected_owner, AuctionError::Unauthorized);
    require_keys_eq!(asset_collection, expected_collection, AuctionError::Unauthorized);

    Ok(())
}

fn verify_active_core_listing_owner(
    asset_account: &AccountInfo,
    expected_owner: Pubkey,
    expected_collection: Pubkey,
) -> Result<()> {
    let (asset_owner, asset_collection) = read_core_asset_owner_and_collection(asset_account)?;
    require_keys_eq!(asset_collection, expected_collection, AuctionError::Unauthorized);
    require_keys_eq!(asset_owner, expected_owner, AuctionError::StaleCoreListing);

    Ok(())
}

/// Read the Royalties plugin from a Metaplex Core asset (or fall back to the
/// collection if absent). Returns `(basis_points, royalty_creator)`.
///
/// The royalty creator is the first creator listed in the plugin (matching the
/// Artifacte mint flow which sets a single creator at 100%). Returns
/// `(0, default_pubkey)` if no Royalties plugin exists at all (no royalty owed).
fn read_core_royalties(
    asset_account: &AccountInfo,
    collection_account: &AccountInfo,
) -> Result<(u16, Pubkey)> {
    use mpl_core::{
        accounts::{BaseAssetV1, BaseCollectionV1},
        fetch_plugin,
        types::{Plugin, PluginType},
    };

    if let Ok((_auth, plugin, _offset)) =
        fetch_plugin::<BaseAssetV1, Plugin>(asset_account, PluginType::Royalties)
    {
        if let Plugin::Royalties(r) = plugin {
            let creator = r
                .creators
                .first()
                .map(|c| c.address)
                .unwrap_or_default();
            return Ok((r.basis_points, creator));
        }
    }

    if let Ok((_auth, plugin, _offset)) =
        fetch_plugin::<BaseCollectionV1, Plugin>(collection_account, PluginType::Royalties)
    {
        if let Plugin::Royalties(r) = plugin {
            let creator = r
                .creators
                .first()
                .map(|c| c.address)
                .unwrap_or_default();
            return Ok((r.basis_points, creator));
        }
    }

    Ok((0u16, Pubkey::default()))
}

enum CoreTransferDelegateState {
    Missing,
    Address(Pubkey),
    Other,
}

fn read_core_transfer_delegate_state(asset_account: &AccountInfo) -> Result<CoreTransferDelegateState> {
    use mpl_core::{
        fetch_asset_plugin,
        types::{PluginAuthority, PluginType, TransferDelegate},
    };

    match fetch_asset_plugin::<TransferDelegate>(asset_account, PluginType::TransferDelegate) {
        Ok((PluginAuthority::Address { address }, _plugin, _offset)) => {
            Ok(CoreTransferDelegateState::Address(address))
        }
        Ok((_authority, _plugin, _offset)) => Ok(CoreTransferDelegateState::Other),
        Err(error)
            if error.kind() == std::io::ErrorKind::Other
                && (error.to_string()
                    == mpl_core::errors::MplCoreError::PluginNotFound.to_string()
                    || error.to_string()
                        == mpl_core::errors::MplCoreError::PluginsNotInitialized.to_string()) =>
        {
            Ok(CoreTransferDelegateState::Missing)
        }
        Err(_error) => Err(error!(AuctionError::InvalidCorePluginState)),
    }
}
