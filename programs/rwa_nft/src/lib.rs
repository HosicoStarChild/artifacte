use anchor_lang::prelude::*;

declare_id!("RWAnft1111111111111111111111111111111111111");

#[program]
pub mod rwa_nft {
    use super::*;

    pub fn create_asset(
        ctx: Context<CreateAsset>,
        name: String,
        category: AssetCategory,
        appraised_value: u64,
        condition_grade: String,
        image_uri: String,
    ) -> Result<()> {
        let asset = &mut ctx.accounts.asset;
        asset.authority = ctx.accounts.authority.key();
        asset.mint = ctx.accounts.mint.key();
        asset.name = name;
        asset.category = category;
        asset.appraised_value = appraised_value;
        asset.condition_grade = condition_grade;
        asset.image_uri = image_uri;
        asset.created_at = Clock::get()?.unix_timestamp;
        asset.is_fractionalized = false;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateAsset<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + AssetAccount::INIT_SPACE,
        seeds = [b"asset", mint.key().as_ref()],
        bump,
    )]
    pub asset: Account<'info, AssetAccount>,
    /// CHECK: The NFT mint
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct AssetAccount {
    pub authority: Pubkey,
    pub mint: Pubkey,
    #[max_len(64)]
    pub name: String,
    pub category: AssetCategory,
    pub appraised_value: u64,
    #[max_len(32)]
    pub condition_grade: String,
    #[max_len(200)]
    pub image_uri: String,
    pub created_at: i64,
    pub is_fractionalized: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AssetCategory {
    RealEstate,
    DigitalArt,
    Agriculture,
    Aviation,
    PreciousMetals,
    Luxury,
    Spirits,
}
