use anchor_lang::prelude::*;

declare_id!("Auct1111111111111111111111111111111111111111");

#[program]
pub mod auction {
    use super::*;

    pub fn create_auction(
        ctx: Context<CreateAuction>,
        start_price: u64,
        end_time: i64,
    ) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        auction.seller = ctx.accounts.seller.key();
        auction.nft_mint = ctx.accounts.nft_mint.key();
        auction.start_price = start_price;
        auction.current_bid = 0;
        auction.current_bidder = Pubkey::default();
        auction.end_time = end_time;
        auction.settled = false;
        auction.created_at = Clock::get()?.unix_timestamp;
        // In production: transfer NFT to auction escrow PDA
        Ok(())
    }

    pub fn place_bid(ctx: Context<PlaceBid>, amount: u64) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let clock = Clock::get()?;

        require!(!auction.settled, AuctionError::AlreadySettled);
        require!(clock.unix_timestamp < auction.end_time, AuctionError::AuctionEnded);

        let min_bid = if auction.current_bid > 0 {
            auction.current_bid + 1
        } else {
            auction.start_price
        };
        require!(amount >= min_bid, AuctionError::BidTooLow);

        // Refund previous bidder if exists
        if auction.current_bid > 0 && auction.current_bidder != Pubkey::default() {
            let escrow_info = ctx.accounts.escrow.to_account_info();
            let prev_bidder_info = ctx.accounts.previous_bidder.to_account_info();
            **escrow_info.try_borrow_mut_lamports()? -= auction.current_bid;
            **prev_bidder_info.try_borrow_mut_lamports()? += auction.current_bid;
        }

        // Transfer new bid to escrow
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.bidder.key(),
            &ctx.accounts.escrow.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.bidder.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        auction.current_bid = amount;
        auction.current_bidder = ctx.accounts.bidder.key();
        Ok(())
    }

    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let clock = Clock::get()?;

        require!(!auction.settled, AuctionError::AlreadySettled);
        require!(clock.unix_timestamp >= auction.end_time, AuctionError::AuctionNotEnded);

        if auction.current_bid > 0 {
            // Transfer SOL from escrow to seller
            let escrow_info = ctx.accounts.escrow.to_account_info();
            let seller_info = ctx.accounts.seller.to_account_info();
            **escrow_info.try_borrow_mut_lamports()? -= auction.current_bid;
            **seller_info.try_borrow_mut_lamports()? += auction.current_bid;
            // In production: transfer NFT from escrow to winner
        }

        auction.settled = true;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateAuction<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + AuctionAccount::INIT_SPACE,
        seeds = [b"auction", nft_mint.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, AuctionAccount>,
    /// CHECK: NFT mint
    pub nft_mint: AccountInfo<'info>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub auction: Account<'info, AuctionAccount>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    /// CHECK: escrow PDA
    #[account(mut)]
    pub escrow: AccountInfo<'info>,
    /// CHECK: previous bidder for refund
    #[account(mut)]
    pub previous_bidder: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    #[account(mut)]
    pub auction: Account<'info, AuctionAccount>,
    /// CHECK: escrow PDA
    #[account(mut)]
    pub escrow: AccountInfo<'info>,
    /// CHECK: seller receives SOL
    #[account(mut)]
    pub seller: AccountInfo<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct AuctionAccount {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub start_price: u64,
    pub current_bid: u64,
    pub current_bidder: Pubkey,
    pub end_time: i64,
    pub settled: bool,
    pub created_at: i64,
}

#[error_code]
pub enum AuctionError {
    #[msg("Auction already settled")]
    AlreadySettled,
    #[msg("Auction has ended")]
    AuctionEnded,
    #[msg("Auction has not ended yet")]
    AuctionNotEnded,
    #[msg("Bid too low")]
    BidTooLow,
}
