use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("23fKEH3emeaJf1PW4Kts3exRnMjoNiqmqyFoNXH6qNiN");

#[program]
pub mod auction {
    use super::*;

    /// Create a new auction for an RWA NFT
    pub fn create_auction(
        ctx: Context<CreateAuction>,
        starting_price: u64,
        reserve_price: u64,
        duration_seconds: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let auction = &mut ctx.accounts.auction;

        auction.creator = ctx.accounts.creator.key();
        auction.mint = ctx.accounts.nft_mint.key();
        auction.payment_mint = ctx.accounts.payment_mint.key();
        auction.starting_price = starting_price;
        auction.reserve_price = reserve_price;
        auction.current_bid = 0;
        auction.highest_bidder = Pubkey::default();
        auction.start_time = clock.unix_timestamp;
        auction.end_time = clock.unix_timestamp + duration_seconds;
        auction.status = AuctionStatus::Active;
        auction.escrow_token_account = ctx.accounts.escrow_nft.key();
        auction.bid_escrow = ctx.accounts.bid_escrow.key();
        auction.bump = ctx.bumps.auction;

        // Transfer NFT from creator to escrow
        let transfer_accounts = Transfer {
            from: ctx.accounts.creator_nft_account.to_account_info(),
            to: ctx.accounts.escrow_nft.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            ),
            1,
        )?;

        emit!(AuctionCreated {
            mint: auction.mint,
            creator: auction.creator,
            starting_price,
            reserve_price,
            end_time: auction.end_time,
            payment_mint: auction.payment_mint,
        });

        Ok(())
    }

    /// Place a bid on an active auction
    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let clock = Clock::get()?;

        // Validate auction state
        require!(
            auction.status == AuctionStatus::Active,
            AuctionError::AuctionNotActive
        );
        require!(
            clock.unix_timestamp < auction.end_time,
            AuctionError::AuctionEnded
        );

        // Validate bid amount
        let min_bid = if auction.current_bid > 0 {
            auction.current_bid + 1
        } else {
            auction.starting_price
        };
        require!(amount >= min_bid, AuctionError::BidTooLow);

        // Refund previous bidder if exists
        if auction.current_bid > 0 && auction.highest_bidder != Pubkey::default() {
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
                        auction.mint.as_ref(),
                        &[bid_escrow_bump],
                    ]],
                ),
                auction.current_bid,
            )?;
        }

        // Transfer new bid to escrow (bidder must approve)
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

        // Update auction state
        auction.current_bid = amount;
        auction.highest_bidder = ctx.accounts.bidder.key();

        emit!(BidPlaced {
            mint: auction.mint,
            bidder: ctx.accounts.bidder.key(),
            amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Settle an auction after end time
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let clock = Clock::get()?;

        // Validate auction can be settled
        require!(
            auction.status == AuctionStatus::Active,
            AuctionError::AuctionNotActive
        );
        require!(
            clock.unix_timestamp >= auction.end_time,
            AuctionError::AuctionNotEnded
        );

        let bid_escrow_bump = ctx.bumps.bid_escrow;
        let escrow_nft_bump = ctx.bumps.escrow_nft;

        if auction.current_bid >= auction.reserve_price && auction.current_bid > 0 {
            // Reserve met: transfer payment to seller (minus fee) and NFT to bidder
            let fee = (auction.current_bid * 250) / 10000; // 2.5% fee
            let seller_amount = auction
                .current_bid
                .checked_sub(fee)
                .ok_or(AuctionError::CalculationError)?;

            // Transfer payment to seller
            let transfer_accounts = Transfer {
                from: ctx.accounts.bid_escrow.to_account_info(),
                to: ctx.accounts.seller_payment_account.to_account_info(),
                authority: ctx.accounts.bid_escrow.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_accounts,
                    &[&[
                        b"bid_escrow",
                        auction.mint.as_ref(),
                        &[bid_escrow_bump],
                    ]],
                ),
                seller_amount,
            )?;

            // Transfer fee to treasury
            let transfer_fee_accounts = Transfer {
                from: ctx.accounts.bid_escrow.to_account_info(),
                to: ctx.accounts.treasury_payment_account.to_account_info(),
                authority: ctx.accounts.bid_escrow.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_fee_accounts,
                    &[&[
                        b"bid_escrow",
                        auction.mint.as_ref(),
                        &[bid_escrow_bump],
                    ]],
                ),
                fee,
            )?;

            // Transfer NFT to highest bidder
            let transfer_nft_accounts = Transfer {
                from: ctx.accounts.escrow_nft.to_account_info(),
                to: ctx.accounts.bidder_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_nft.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_nft_accounts,
                    &[&[
                        b"escrow_nft",
                        auction.mint.as_ref(),
                        &[escrow_nft_bump],
                    ]],
                ),
                1,
            )?;

            auction.status = AuctionStatus::Settled;

            emit!(AuctionSettled {
                mint: auction.mint,
                winner: auction.highest_bidder,
                price: auction.current_bid,
                fee,
            });
        } else {
            // Reserve not met: return NFT to creator and refund bids
            if auction.current_bid > 0 && auction.highest_bidder != Pubkey::default() {
                let transfer_accounts = Transfer {
                    from: ctx.accounts.bid_escrow.to_account_info(),
                    to: ctx.accounts.bidder_refund_account.to_account_info(),
                    authority: ctx.accounts.bid_escrow.to_account_info(),
                };

                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        transfer_accounts,
                        &[&[
                            b"bid_escrow",
                            auction.mint.as_ref(),
                            &[bid_escrow_bump],
                        ]],
                    ),
                    auction.current_bid,
                )?;
            }

            // Return NFT to creator
            let transfer_nft_accounts = Transfer {
                from: ctx.accounts.escrow_nft.to_account_info(),
                to: ctx.accounts.creator_nft_account.to_account_info(),
                authority: ctx.accounts.escrow_nft.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_nft_accounts,
                    &[&[
                        b"escrow_nft",
                        auction.mint.as_ref(),
                        &[escrow_nft_bump],
                    ]],
                ),
                1,
            )?;

            auction.status = AuctionStatus::Cancelled;

            emit!(AuctionCancelled {
                mint: auction.mint,
                reason: "Reserve price not met".to_string(),
            });
        }

        Ok(())
    }

    /// Cancel an auction before any bids
    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        let auction = &mut ctx.accounts.auction;

        // Only creator can cancel
        require!(
            ctx.accounts.creator.key() == auction.creator,
            AuctionError::Unauthorized
        );

        // Can only cancel if no bids
        require!(
            auction.current_bid == 0,
            AuctionError::CannotCancelWithBids
        );

        let escrow_nft_bump = ctx.bumps.escrow_nft;

        // Return NFT to creator
        let transfer_nft_accounts = Transfer {
            from: ctx.accounts.escrow_nft.to_account_info(),
            to: ctx.accounts.creator_nft_account.to_account_info(),
            authority: ctx.accounts.escrow_nft.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_nft_accounts,
                &[&[
                    b"escrow_nft",
                    auction.mint.as_ref(),
                    &[escrow_nft_bump],
                ]],
            ),
            1,
        )?;

        auction.status = AuctionStatus::Cancelled;

        emit!(AuctionCancelled {
            mint: auction.mint,
            reason: "Cancelled by creator".to_string(),
        });

        Ok(())
    }
}

// ============================================================================
// Instructions
// ============================================================================

#[derive(Accounts)]
pub struct CreateAuction<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Auction::INIT_SPACE,
        seeds = [b"auction", nft_mint.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, Auction>,
    pub nft_mint: Account<'info, Mint>,
    pub payment_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        token::mint = nft_mint,
        token::authority = creator,
        seeds = [b"escrow_nft", nft_mint.key().as_ref()],
        bump,
    )]
    pub escrow_nft: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = creator,
        token::mint = payment_mint,
        token::authority = creator,
        seeds = [b"bid_escrow", nft_mint.key().as_ref()],
        bump,
    )]
    pub bid_escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        seeds = [b"bid_escrow", auction.mint.as_ref()],
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
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        seeds = [b"bid_escrow", auction.mint.as_ref()],
        bump,
    )]
    pub bid_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"escrow_nft", auction.mint.as_ref()],
        bump,
    )]
    pub escrow_nft: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_payment_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bidder_nft_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bidder_refund_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator_nft_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelAuction<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        seeds = [b"escrow_nft", auction.mint.as_ref()],
        bump,
    )]
    pub escrow_nft: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator_nft_account: Account<'info, TokenAccount>,
    pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ============================================================================
// State
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionStatus {
    Active,
    Settled,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub payment_mint: Pubkey,
    pub starting_price: u64,
    pub reserve_price: u64,
    pub current_bid: u64,
    pub highest_bidder: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub status: AuctionStatus,
    pub escrow_token_account: Pubkey,
    pub bid_escrow: Pubkey,
    pub bump: u8,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct AuctionCreated {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub starting_price: u64,
    pub reserve_price: u64,
    pub end_time: i64,
    pub payment_mint: Pubkey,
}

#[event]
pub struct BidPlaced {
    pub mint: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AuctionSettled {
    pub mint: Pubkey,
    pub winner: Pubkey,
    pub price: u64,
    pub fee: u64,
}

#[event]
pub struct AuctionCancelled {
    pub mint: Pubkey,
    pub reason: String,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum AuctionError {
    #[msg("Auction is not active")]
    AuctionNotActive,
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
}
