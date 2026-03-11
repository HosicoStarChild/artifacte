use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3");

// Treasury wallet
const TREASURY: &str = "6drXw31FjHch4ixXa4ngTyUD2cySUs3mpcB2YYGA9g7P";

// Standard token mints
const SOL_MINT: &str = "So11111111111111111111111111111111111111112"; // Wrapped SOL mint
const USD1_MINT: &str = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";
const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

#[program]
pub mod auction {
    use super::*;

    /// List an item for sale (either fixed price or auction)
    pub fn list_item(
        ctx: Context<ListItem>,
        listing_type: ListingType,
        price: u64,
        duration_seconds: Option<i64>,
        category: ItemCategory,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let listing = &mut ctx.accounts.listing;

        // Validate price is non-zero and reasonable (max 1 billion tokens)
        require!(price > 0, AuctionError::InvalidPrice);
        require!(price <= 1_000_000_000_000_000_000, AuctionError::InvalidPrice); // ~1B tokens at 9 decimals

        // Validate category matches allowed payments
        validate_category_and_payment(&category, ctx.accounts.payment_mint.key())?;

        // Validate duration for auctions
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
        listing.end_time = if let Some(duration) = duration_seconds {
            clock.unix_timestamp + duration
        } else {
            0
        };
        listing.status = ListingStatus::Active;
        listing.escrow_nft_account = ctx.accounts.escrow_nft.key();
        listing.current_bid = 0;
        listing.highest_bidder = Pubkey::default();
        listing.bump = ctx.bumps.listing;

        // Transfer NFT from seller to escrow
        let transfer_accounts = Transfer {
            from: ctx.accounts.seller_nft_account.to_account_info(),
            to: ctx.accounts.escrow_nft.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            ),
            1,
        )?;

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

    /// Place a bid on an active auction
    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let clock = Clock::get()?;

        // Validate it's an auction
        require!(
            matches!(listing.listing_type, ListingType::Auction),
            AuctionError::NotAnAuction
        );

        // Validate auction is still active
        require!(
            listing.status == ListingStatus::Active,
            AuctionError::ListingNotActive
        );
        require!(
            clock.unix_timestamp < listing.end_time,
            AuctionError::AuctionEnded
        );

        // Validate bid amount
        let min_bid = if listing.current_bid > 0 {
            listing.current_bid + 1
        } else {
            listing.price
        };
        require!(amount >= min_bid, AuctionError::BidTooLow);

        // Refund previous bidder if exists
        if listing.current_bid > 0 && listing.highest_bidder != Pubkey::default() {
            let bid_escrow_bump = ctx.bumps.bid_escrow;
            let transfer_accounts = Transfer {
                from: ctx.accounts.bid_escrow.to_account_info(),
                to: ctx.accounts.previous_bidder_account.to_account_info(),
                authority: ctx.accounts.bid_escrow.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_accounts,
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
        let transfer_accounts = Transfer {
            from: ctx.accounts.bidder_token_account.to_account_info(),
            to: ctx.accounts.bid_escrow.to_account_info(),
            authority: ctx.accounts.bidder.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            ),
            amount,
        )?;

        // Update listing state
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
    pub fn buy_now(ctx: Context<BuyNow>) -> Result<()> {
        let listing = &ctx.accounts.listing;
        let clock = Clock::get()?;

        // Validate it's a fixed price listing
        require!(
            matches!(listing.listing_type, ListingType::FixedPrice),
            AuctionError::NotFixedPrice
        );

        // Validate listing is active
        require!(
            listing.status == ListingStatus::Active,
            AuctionError::ListingNotActive
        );

        // Calculate fees and payments
        let platform_fee = (listing.price * 200) / 10000; // 2% platform fee
        
        // BAXUS 10% seller fee (temporary until they migrate to Metaplex standard)
        let baxus_fee = if listing.baxus_fee {
            (listing.price * 1000) / 10000 // 10%
        } else {
            0u64
        };
        
        // Get creator royalties from metadata (simplified to 0 if not readable)
        let creator_royalty = 0u64; // TODO: Read from Metaplex metadata
        
        let seller_amount = listing
            .price
            .checked_sub(platform_fee)
            .ok_or(AuctionError::CalculationError)?
            .checked_sub(baxus_fee)
            .ok_or(AuctionError::CalculationError)?
            .checked_sub(creator_royalty)
            .ok_or(AuctionError::CalculationError)?;

        // Transfer payment from buyer to seller
        let transfer_seller = Transfer {
            from: ctx.accounts.buyer_payment_account.to_account_info(),
            to: ctx.accounts.seller_payment_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_seller,
            ),
            seller_amount,
        )?;

        // Transfer platform fee to treasury
        let transfer_fee = Transfer {
            from: ctx.accounts.buyer_payment_account.to_account_info(),
            to: ctx.accounts.treasury_payment_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_fee,
            ),
            platform_fee + baxus_fee, // BAXUS fee also goes to treasury
        )?;

        // Transfer creator royalty if applicable
        if creator_royalty > 0 {
            let transfer_royalty = Transfer {
                from: ctx.accounts.buyer_payment_account.to_account_info(),
                to: ctx.accounts.creator_payment_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            };

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_royalty,
                ),
                creator_royalty,
            )?;
        }

        // Transfer NFT from escrow to buyer
        let escrow_nft_bump = listing.bump;
        let transfer_nft = Transfer {
            from: ctx.accounts.escrow_nft.to_account_info(),
            to: ctx.accounts.buyer_nft_account.to_account_info(),
            authority: ctx.accounts.escrow_nft.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_nft,
                &[&[
                    b"escrow_nft",
                    listing.nft_mint.as_ref(),
                    &[escrow_nft_bump],
                ]],
            ),
            1,
        )?;

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
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;

        // Only seller can cancel
        require!(
            ctx.accounts.seller.key() == listing.seller,
            AuctionError::Unauthorized
        );

        // For auctions, only allow cancellation if no bids
        if matches!(listing.listing_type, ListingType::Auction) {
            require!(
                listing.current_bid == 0,
                AuctionError::CannotCancelWithBids
            );
        }

        let escrow_nft_bump = listing.bump;

        // Return NFT to seller
        let transfer_nft = Transfer {
            from: ctx.accounts.escrow_nft.to_account_info(),
            to: ctx.accounts.seller_nft_account.to_account_info(),
            authority: ctx.accounts.escrow_nft.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_nft,
                &[&[
                    b"escrow_nft",
                    listing.nft_mint.as_ref(),
                    &[escrow_nft_bump],
                ]],
            ),
            1,
        )?;

        listing.status = ListingStatus::Cancelled;

        emit!(ListingCancelled {
            nft_mint: listing.nft_mint,
            seller: listing.seller,
        });

        Ok(())
    }

    /// Settle an auction after end time
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let clock = Clock::get()?;

        // Validate it's an auction
        require!(
            matches!(listing.listing_type, ListingType::Auction),
            AuctionError::NotAnAuction
        );

        // Validate auction has ended
        require!(
            listing.status == ListingStatus::Active,
            AuctionError::ListingNotActive
        );
        require!(
            clock.unix_timestamp >= listing.end_time,
            AuctionError::AuctionNotEnded
        );

        let escrow_nft_bump = listing.bump;

        if listing.current_bid > 0 {
            // Auction has bids: transfer to highest bidder and distribute payments
            let platform_fee = (listing.current_bid * 200) / 10000; // 2% platform fee
            
            // BAXUS 10% seller fee
            let baxus_fee = if listing.baxus_fee {
                (listing.current_bid * 1000) / 10000
            } else {
                0u64
            };
            
            // Get creator royalties from metadata (simplified to 0 if not readable)
            let creator_royalty = 0u64; // TODO: Read from Metaplex metadata
            
            let seller_amount = listing
                .current_bid
                .checked_sub(platform_fee)
                .ok_or(AuctionError::CalculationError)?
                .checked_sub(baxus_fee)
                .ok_or(AuctionError::CalculationError)?
                .checked_sub(creator_royalty)
                .ok_or(AuctionError::CalculationError)?;

            // Transfer payment to seller
            let transfer_seller = Transfer {
                from: ctx.accounts.bid_escrow.to_account_info(),
                to: ctx.accounts.seller_payment_account.to_account_info(),
                authority: ctx.accounts.bid_escrow.to_account_info(),
            };

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_seller,
                ),
                seller_amount,
            )?;

            // Transfer platform fee to treasury
            let transfer_fee = Transfer {
                from: ctx.accounts.bid_escrow.to_account_info(),
                to: ctx.accounts.treasury_payment_account.to_account_info(),
                authority: ctx.accounts.bid_escrow.to_account_info(),
            };

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_fee,
                ),
                platform_fee + baxus_fee,
            )?;

            // Transfer creator royalty if applicable
            if creator_royalty > 0 {
                let transfer_royalty = Transfer {
                    from: ctx.accounts.bid_escrow.to_account_info(),
                    to: ctx.accounts.creator_payment_account.to_account_info(),
                    authority: ctx.accounts.bid_escrow.to_account_info(),
                };

                token::transfer(
                    CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        transfer_royalty,
                    ),
                    creator_royalty,
                )?;
            }

            // Transfer NFT to highest bidder
            let transfer_nft = Transfer {
                from: ctx.accounts.escrow_nft.to_account_info(),
                to: ctx.accounts.buyer_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_nft.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_nft,
                    &[&[
                        b"escrow_nft",
                        listing.nft_mint.as_ref(),
                        &[escrow_nft_bump],
                    ]],
                ),
                1,
            )?;

            listing.status = ListingStatus::Settled;

            emit!(AuctionSettled {
                nft_mint: listing.nft_mint,
                winner: listing.highest_bidder,
                price: listing.current_bid,
                platform_fee,
            });
        } else {
            // No bids: return NFT to seller
            let transfer_nft = Transfer {
                from: ctx.accounts.escrow_nft.to_account_info(),
                to: ctx.accounts.seller_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_nft.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_nft,
                    &[&[
                        b"escrow_nft",
                        listing.nft_mint.as_ref(),
                        &[escrow_nft_bump],
                    ]],
                ),
                1,
            )?;

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
            // Digital Art accepts SOL only
            require!(
                payment_str == SOL_MINT,
                AuctionError::InvalidPaymentMint
            );
        }
        ItemCategory::Spirits
        | ItemCategory::TCGCards
        | ItemCategory::SportsCards
        | ItemCategory::Watches => {
            // These accept USD1 or USDC only
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
#[instruction(listing_type: ListingType, price: u64, duration_seconds: Option<i64>, category: ItemCategory)]
pub struct ListItem<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", nft_mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,
    pub nft_mint: Account<'info, Mint>,
    pub payment_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = seller,
        token::mint = nft_mint,
        token::authority = seller,
        seeds = [b"escrow_nft", nft_mint.key().as_ref()],
        bump,
    )]
    pub escrow_nft: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller: Signer<'info>,
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
    #[account(
        mut,
        token::mint = listing.nft_mint,
    )]
    pub escrow_nft: Account<'info, TokenAccount>,
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
    pub buyer_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        token::mint = listing.nft_mint,
    )]
    pub escrow_nft: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_nft_account: Account<'info, TokenAccount>,
    pub seller: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        token::mint = listing.payment_mint,
    )]
    pub bid_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = listing.nft_mint,
    )]
    pub escrow_nft: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_payment_account: Account<'info, TokenAccount>,
    /// CHECK: Creator payment account (may not exist yet)
    #[account(mut)]
    pub creator_payment_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub buyer_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_nft_account: Account<'info, TokenAccount>,
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
    pub baxus_fee: bool, // true = 10% additional seller fee for BAXUS items
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
}
