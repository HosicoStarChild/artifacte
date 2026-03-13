use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::token_interface::{
    Mint as IfaceMint,
    TokenAccount as IfaceTokenAccount,
    TokenInterface,
};
use spl_token_2022::extension::BaseStateWithExtensions;
use spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi;

declare_id!("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");

// Treasury wallet
const TREASURY: &str = "6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P";

// Standard token mints
const SOL_MINT: &str = "So11111111111111111111111111111111111111112";
const USD1_MINT: &str = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

        // Validate category matches allowed payments
        validate_category_and_payment(&category, ctx.accounts.payment_mint.key())?;

        // Validate duration for auctions
        if matches!(listing_type, ListingType::Auction) {
            require!(
                duration_seconds.is_some() && duration_seconds.unwrap() > 0,
                AuctionError::InvalidDuration
            );
        }

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
        let listing = &ctx.accounts.listing;

        require!(
            matches!(listing.listing_type, ListingType::FixedPrice),
            AuctionError::NotFixedPrice
        );
        require!(
            listing.status == ListingStatus::Active,
            AuctionError::ListingNotActive
        );

        // Calculate fees
        let platform_fee = (listing.price * 200) / 10000; // 2%
        let baxus_fee = if listing.baxus_fee {
            (listing.price * 1000) / 10000 // 10%
        } else {
            0u64
        };
        let creator_royalty = (listing.price * listing.royalty_basis_points as u64) / 10000;

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

        listing.status = ListingStatus::Cancelled;

        emit!(ListingCancelled {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
        });

        Ok(())
    }

    /// Settle an auction after end time
    ///
    /// For WNS/Token-2022: client MUST include WNS `approve_transfer` (amount=0)
    /// remaining_accounts: same layout as list_item
    pub fn settle_auction<'info>(ctx: Context<'_, '_, '_, 'info, SettleAuction<'info>>) -> Result<()> {
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
            // Auction has bids: distribute payments + transfer NFT to winner
            let platform_fee = (listing.current_bid * 200) / 10000;
            let baxus_fee = if listing.baxus_fee {
                (listing.current_bid * 1000) / 10000
            } else {
                0u64
            };
            let creator_royalty = (listing.current_bid * listing.royalty_basis_points as u64) / 10000;

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

            listing.status = ListingStatus::Settled;

            emit!(AuctionSettled {
                nft_mint: listing.nft_mint,
                winner: listing.highest_bidder,
                price: listing.current_bid,
                platform_fee,
            });
        } else {
            // No bids: return NFT to seller
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
            require!(
                payment_str == USD1_MINT || payment_str == USDC_MINT,
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
        init,
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
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        seeds = [b"bid_escrow", listing.nft_mint.as_ref()],
        bump,
    )]
    pub bid_escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bidder_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub previous_bidder_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyNow<'info> {
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
    pub buyer_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_payment_account: Account<'info, TokenAccount>,
    /// CHECK: Creator payment account (may not exist yet)
    #[account(mut)]
    pub creator_payment_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub buyer_nft_account: InterfaceAccount<'info, IfaceTokenAccount>,
    #[account(mut)]
    pub buyer: Signer<'info>,
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
    #[account(mut)]
    pub seller_payment_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub treasury_payment_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Creator payment account (may not exist yet)
    #[account(mut)]
    pub creator_payment_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub buyer_nft_account: Box<InterfaceAccount<'info, IfaceTokenAccount>>,
    #[account(mut)]
    pub seller_nft_account: Box<InterfaceAccount<'info, IfaceTokenAccount>>,
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
}
