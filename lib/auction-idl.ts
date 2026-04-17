export type Auction = {
  "address": "81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3",
  "metadata": {
    "name": "auction",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "buy_now",
      "docs": [
        "Buy a fixed-price listing immediately",
        "",
        "For WNS/Token-2022 NFTs: client MUST include WNS `approve_transfer` IX",
        "(amount=0) BEFORE this instruction in the same transaction.",
        "remaining_accounts: same layout as list_item"
      ],
      "discriminator": [
        242,
        42,
        184,
        77,
        133,
        152,
        118,
        204
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "buyer_payment_account",
          "writable": true
        },
        {
          "name": "seller_payment_account",
          "docs": [
            "Seller payment account \u2014 must be owned by listing.seller"
          ],
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "docs": [
            "Treasury payment account \u2014 validated in instruction body against treasury_config or fallback"
          ],
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "buyer_nft_account",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "docs": [
            "Treasury config PDA \u2014 if present, overrides hardcoded treasury address"
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "nft_token_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "buy_now_core",
      "docs": [
        "Public buy of a Core listing. Splits USDC (platform fee + royalty +",
        "remainder), then CPIs TransferV1 to move the asset to the buyer."
      ],
      "discriminator": [
        107,
        235,
        190,
        104,
        232,
        171,
        241,
        145
      ],
      "accounts": [
        {
          "name": "buyer",
          "docs": [
            "Public buyer."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "core_listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "core_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "payment_mint",
          "docs": [
            "USDC mint (validated in handler)."
          ]
        },
        {
          "name": "buyer_payment_account",
          "writable": true
        },
        {
          "name": "seller_payment_account",
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mpl_core_program",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "buy_now_pnft",
      "docs": [
        "Buy a fixed-price pNFT listing."
      ],
      "discriminator": [
        26,
        178,
        190,
        138,
        45,
        22,
        144,
        30
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "nft_metadata",
          "writable": true
        },
        {
          "name": "nft_edition"
        },
        {
          "name": "escrow_authority",
          "docs": [
            "Escrow authority PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "escrow_nft_token",
          "writable": true
        },
        {
          "name": "escrow_token_record",
          "writable": true
        },
        {
          "name": "buyer_nft_token",
          "writable": true
        },
        {
          "name": "buyer_token_record",
          "writable": true
        },
        {
          "name": "buyer_payment_account",
          "writable": true
        },
        {
          "name": "seller_payment_account",
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "token_metadata_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "ata_program"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sysvar_instructions"
        },
        {
          "name": "authorization_rules_program",
          "optional": true
        },
        {
          "name": "authorization_rules",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "cancel_core_listing",
      "docs": [
        "Cancel a Core listing (owner only). Revokes the TransferDelegate authority",
        "by removing the plugin, and closes the CoreListing PDA."
      ],
      "discriminator": [
        58,
        30,
        81,
        251,
        75,
        37,
        173,
        211
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "core_listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "core_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "mpl_core_program",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "cancel_listing",
      "docs": [
        "Cancel a listing (seller only, auctions only if no bids)",
        "",
        "For WNS/Token-2022: client MUST include WNS `approve_transfer` (amount=0)",
        "remaining_accounts: same layout as list_item"
      ],
      "discriminator": [
        41,
        183,
        50,
        232,
        230,
        233,
        157,
        70
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "seller_nft_account",
          "writable": true
        },
        {
          "name": "seller",
          "signer": true
        },
        {
          "name": "nft_token_program"
        }
      ],
      "args": []
    },
    {
      "name": "cancel_listing_pnft",
      "docs": [
        "Cancel a pNFT listing \u2014 return NFT to seller."
      ],
      "discriminator": [
        41,
        48,
        179,
        6,
        129,
        16,
        120,
        65
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "nft_metadata",
          "writable": true
        },
        {
          "name": "nft_edition"
        },
        {
          "name": "escrow_authority",
          "docs": [
            "Escrow authority PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "escrow_nft_token",
          "writable": true
        },
        {
          "name": "escrow_token_record",
          "writable": true
        },
        {
          "name": "seller_nft_token",
          "writable": true
        },
        {
          "name": "seller_token_record",
          "writable": true
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_metadata_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "ata_program"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sysvar_instructions"
        },
        {
          "name": "authorization_rules_program",
          "optional": true
        },
        {
          "name": "authorization_rules",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "close_stale_listing",
      "docs": [
        "Close a stale listing where escrow is empty (NFT already returned)",
        "This allows re-listing the same NFT after a cancelled listing"
      ],
      "discriminator": [
        120,
        38,
        229,
        87,
        16,
        1,
        54,
        10
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "nft_token_program"
        }
      ],
      "args": []
    },
    {
      "name": "initialize_treasury",
      "docs": [
        "Initialize the treasury config PDA (one-time setup by deploy authority)"
      ],
      "discriminator": [
        124,
        186,
        211,
        195,
        85,
        165,
        129,
        166
      ],
      "accounts": [
        {
          "name": "treasury_config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "list_core_item",
      "docs": [
        "List a Metaplex Core asset for fixed-price USDC sale."
      ],
      "discriminator": [
        249,
        213,
        18,
        100,
        230,
        110,
        232,
        59
      ],
      "accounts": [
        {
          "name": "seller",
          "docs": [
            "Owner-signed (must equal OWNER_WALLET \u2014 checked in handler)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "payment_mint",
          "docs": [
            "USDC mint (validated in handler)."
          ]
        },
        {
          "name": "core_listing",
          "docs": [
            "CoreListing PDA \u2014 created on list, closed on cancel/buy."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "core_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "mpl_core_program",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "price_usdc",
          "type": "u64"
        }
      ]
    },
    {
      "name": "list_item",
      "docs": [
        "List an item for sale (either fixed price or auction)",
        "",
        "For WNS/Token-2022 NFTs: client MUST include a WNS `approve_transfer` IX",
        "(amount=0) BEFORE this instruction in the same transaction.",
        "remaining_accounts for Token-2022:",
        "[0] extra_metas_account PDA (readonly) - seeds: [\"extra-account-metas\", nft_mint]",
        "[1] approve_account PDA (writable) - seeds: [\"approve-account\", nft_mint]",
        "[2] wns_program (readonly)"
      ],
      "discriminator": [
        174,
        245,
        22,
        211,
        228,
        103,
        121,
        13
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "payment_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "seller_nft_account",
          "writable": true
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "nft_token_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "listing_type",
          "type": {
            "defined": {
              "name": "ListingType"
            }
          }
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "duration_seconds",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "ItemCategory"
            }
          }
        },
        {
          "name": "royalty_basis_points",
          "type": "u16"
        },
        {
          "name": "creator_address",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "list_item_pnft",
      "docs": [
        "List a pNFT (Metaplex programmable NFT) for sale.",
        "Uses Token Metadata TransferV1 CPI with delegate + token_record."
      ],
      "discriminator": [
        236,
        179,
        101,
        29,
        212,
        149,
        190,
        159
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "nft_metadata",
          "writable": true
        },
        {
          "name": "nft_edition"
        },
        {
          "name": "seller_nft_token",
          "writable": true
        },
        {
          "name": "seller_token_record",
          "writable": true
        },
        {
          "name": "escrow_authority",
          "docs": [
            "Escrow authority PDA \u2014 owns the escrow token account"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "escrow_nft_token",
          "docs": [
            "Escrow token account \u2014 created by Token Metadata via ATA"
          ],
          "writable": true
        },
        {
          "name": "escrow_token_record",
          "docs": [
            "Escrow token record (pNFT programmable config)"
          ],
          "writable": true
        },
        {
          "name": "payment_mint"
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_metadata_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "ata_program"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sysvar_instructions"
        },
        {
          "name": "authorization_rules_program",
          "optional": true
        },
        {
          "name": "authorization_rules",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "listing_type",
          "type": {
            "defined": {
              "name": "ListingType"
            }
          }
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "duration_seconds",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "ItemCategory"
            }
          }
        },
        {
          "name": "royalty_basis_points",
          "type": "u16"
        },
        {
          "name": "creator_address",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "place_bid",
      "docs": [
        "Place a bid on an active auction (payment tokens only, no NFT transfer)"
      ],
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "payment_mint",
          "docs": [
            "Payment mint \u2014 must match the listing's payment mint"
          ]
        },
        {
          "name": "bid_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "bidder_token_account",
          "writable": true
        },
        {
          "name": "previous_bidder_account",
          "writable": true
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settle_auction",
      "docs": [
        "Settle an auction after end time",
        "",
        "For WNS/Token-2022: client MUST include WNS `approve_transfer` (amount=0)",
        "remaining_accounts: same layout as list_item"
      ],
      "discriminator": [
        246,
        196,
        183,
        98,
        222,
        139,
        46,
        133
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "bid_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "seller_payment_account",
          "docs": [
            "Seller's payment token account \u2014 must be owned by listing.seller"
          ],
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "docs": [
            "Treasury payment account \u2014 validated in instruction body against treasury_config or fallback"
          ],
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "buyer_nft_account",
          "docs": [
            "Buyer NFT account \u2014 must be owned by highest bidder (or seller if no bids for return)"
          ],
          "writable": true
        },
        {
          "name": "seller_nft_account",
          "docs": [
            "Seller NFT account \u2014 must be owned by listing.seller (for no-bid return)"
          ],
          "writable": true
        },
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "docs": [
            "Treasury config PDA \u2014 if present, overrides hardcoded treasury address"
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "nft_token_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "update_treasury",
      "docs": [
        "Update treasury address (deploy authority only)"
      ],
      "discriminator": [
        60,
        16,
        243,
        66,
        96,
        59,
        254,
        131
      ],
      "accounts": [
        {
          "name": "treasury_config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_treasury",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "CoreListing",
      "discriminator": [
        205,
        178,
        162,
        169,
        199,
        166,
        133,
        157
      ]
    },
    {
      "name": "Listing",
      "discriminator": [
        218,
        32,
        50,
        73,
        43,
        134,
        26,
        58
      ]
    },
    {
      "name": "TreasuryConfig",
      "discriminator": [
        124,
        54,
        212,
        227,
        213,
        189,
        168,
        41
      ]
    }
  ],
  "events": [
    {
      "name": "AuctionCancelled",
      "discriminator": [
        22,
        32,
        51,
        83,
        215,
        194,
        171,
        209
      ]
    },
    {
      "name": "AuctionSettled",
      "discriminator": [
        61,
        151,
        131,
        170,
        95,
        203,
        219,
        147
      ]
    },
    {
      "name": "BidPlaced",
      "discriminator": [
        135,
        53,
        176,
        83,
        193,
        69,
        108,
        61
      ]
    },
    {
      "name": "CoreListingCancelled",
      "discriminator": [
        165,
        96,
        88,
        242,
        37,
        224,
        205,
        57
      ]
    },
    {
      "name": "CoreListingCreated",
      "discriminator": [
        184,
        108,
        121,
        191,
        52,
        251,
        30,
        84
      ]
    },
    {
      "name": "CorePurchased",
      "discriminator": [
        221,
        82,
        110,
        196,
        235,
        58,
        114,
        17
      ]
    },
    {
      "name": "ItemPurchased",
      "discriminator": [
        33,
        219,
        12,
        58,
        205,
        48,
        63,
        143
      ]
    },
    {
      "name": "ListingCancelled",
      "discriminator": [
        11,
        46,
        163,
        10,
        103,
        80,
        139,
        194
      ]
    },
    {
      "name": "ListingCreated",
      "discriminator": [
        94,
        164,
        167,
        255,
        246,
        186,
        12,
        96
      ]
    },
    {
      "name": "TreasuryUpdated",
      "discriminator": [
        80,
        239,
        54,
        168,
        43,
        38,
        85,
        145
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "ListingNotActive",
      "msg": "Listing is not active"
    },
    {
      "code": 6001,
      "name": "AuctionEnded",
      "msg": "Auction has already ended"
    },
    {
      "code": 6002,
      "name": "AuctionNotEnded",
      "msg": "Auction has not ended yet"
    },
    {
      "code": 6003,
      "name": "BidTooLow",
      "msg": "Bid is too low"
    },
    {
      "code": 6004,
      "name": "CalculationError",
      "msg": "Calculation error"
    },
    {
      "code": 6005,
      "name": "Unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6006,
      "name": "CannotCancelWithBids",
      "msg": "Cannot cancel auction with existing bids"
    },
    {
      "code": 6007,
      "name": "NotAnAuction",
      "msg": "Invalid listing type for this operation"
    },
    {
      "code": 6008,
      "name": "NotFixedPrice",
      "msg": "Invalid listing type for this operation"
    },
    {
      "code": 6009,
      "name": "InvalidDuration",
      "msg": "Invalid duration for auction"
    },
    {
      "code": 6010,
      "name": "InvalidPaymentMint",
      "msg": "Invalid payment mint for this category"
    },
    {
      "code": 6011,
      "name": "InvalidPrice",
      "msg": "Price must be greater than zero"
    },
    {
      "code": 6012,
      "name": "InsufficientWNSAccounts",
      "msg": "Insufficient WNS remaining accounts for Token-2022 transfer"
    },
    {
      "code": 6013,
      "name": "TransferFailed",
      "msg": "Token-2022 transfer with hook failed"
    },
    {
      "code": 6014,
      "name": "SellerCannotBid",
      "msg": "Seller cannot bid on their own auction"
    },
    {
      "code": 6015,
      "name": "InvalidRefundAccount",
      "msg": "Invalid refund account \u2014 must be previous bidder's ATA"
    },
    {
      "code": 6016,
      "name": "RoyaltyTooHigh",
      "msg": "Royalty basis points too high (max 1000 = 10%)"
    },
    {
      "code": 6017,
      "name": "InvalidBuyerAccount",
      "msg": "Invalid buyer account \u2014 must be owned by highest bidder"
    },
    {
      "code": 6018,
      "name": "InvalidCreatorAccount",
      "msg": "Invalid creator account \u2014 must be creator's ATA for payment mint"
    },
    {
      "code": 6019,
      "name": "InvalidTokenProgram",
      "msg": "Invalid token program \u2014 must be SPL Token or Token-2022"
    },
    {
      "code": 6020,
      "name": "InvalidRoyaltyBps",
      "msg": "Invalid royalty basis points \u2014 must be 0 or >= 100 (1%)"
    }
  ],
  "types": [
    {
      "name": "AuctionCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "AuctionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "platform_fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "BidPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "CoreListing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "created_at",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "CoreListingCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "CoreListingCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "price_usdc",
            "type": "u64"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "CorePurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "price_usdc",
            "type": "u64"
          },
          {
            "name": "platform_fee",
            "type": "u64"
          },
          {
            "name": "creator_royalty",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "ItemCategory",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "DigitalArt"
          },
          {
            "name": "Spirits"
          },
          {
            "name": "TCGCards"
          },
          {
            "name": "SportsCards"
          },
          {
            "name": "Watches"
          }
        ]
      }
    },
    {
      "name": "ItemPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "platform_fee",
            "type": "u64"
          },
          {
            "name": "creator_royalty",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Listing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "listing_type",
            "type": {
              "defined": {
                "name": "ListingType"
              }
            }
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "ItemCategory"
              }
            }
          },
          {
            "name": "start_time",
            "type": "i64"
          },
          {
            "name": "end_time",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "ListingStatus"
              }
            }
          },
          {
            "name": "escrow_nft_account",
            "type": "pubkey"
          },
          {
            "name": "current_bid",
            "type": "u64"
          },
          {
            "name": "highest_bidder",
            "type": "pubkey"
          },
          {
            "name": "baxus_fee",
            "type": "bool"
          },
          {
            "name": "is_token2022",
            "type": "bool"
          },
          {
            "name": "is_pnft",
            "type": "bool"
          },
          {
            "name": "royalty_basis_points",
            "type": "u16"
          },
          {
            "name": "creator_address",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "ListingCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ListingCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "listing_type",
            "type": {
              "defined": {
                "name": "ListingType"
              }
            }
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "ItemCategory"
              }
            }
          },
          {
            "name": "end_time",
            "type": "i64"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ListingStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Active"
          },
          {
            "name": "Settled"
          },
          {
            "name": "Cancelled"
          }
        ]
      }
    },
    {
      "name": "ListingType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "FixedPrice"
          },
          {
            "name": "Auction"
          }
        ]
      }
    },
    {
      "name": "TreasuryConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "TreasuryUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "old_treasury",
            "type": "pubkey"
          },
          {
            "name": "new_treasury",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};

export const IDL: Auction = {
  "address": "81s1tEx4MPdVvqS6X84Mok5K4N5fMbRLzcsT5eo2K8J3",
  "metadata": {
    "name": "auction",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "buy_now",
      "docs": [
        "Buy a fixed-price listing immediately",
        "",
        "For WNS/Token-2022 NFTs: client MUST include WNS `approve_transfer` IX",
        "(amount=0) BEFORE this instruction in the same transaction.",
        "remaining_accounts: same layout as list_item"
      ],
      "discriminator": [
        242,
        42,
        184,
        77,
        133,
        152,
        118,
        204
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "buyer_payment_account",
          "writable": true
        },
        {
          "name": "seller_payment_account",
          "docs": [
            "Seller payment account \u2014 must be owned by listing.seller"
          ],
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "docs": [
            "Treasury payment account \u2014 validated in instruction body against treasury_config or fallback"
          ],
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "buyer_nft_account",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "docs": [
            "Treasury config PDA \u2014 if present, overrides hardcoded treasury address"
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "nft_token_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "buy_now_core",
      "docs": [
        "Public buy of a Core listing. Splits USDC (platform fee + royalty +",
        "remainder), then CPIs TransferV1 to move the asset to the buyer."
      ],
      "discriminator": [
        107,
        235,
        190,
        104,
        232,
        171,
        241,
        145
      ],
      "accounts": [
        {
          "name": "buyer",
          "docs": [
            "Public buyer."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "core_listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "core_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "payment_mint",
          "docs": [
            "USDC mint (validated in handler)."
          ]
        },
        {
          "name": "buyer_payment_account",
          "writable": true
        },
        {
          "name": "seller_payment_account",
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mpl_core_program",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "buy_now_pnft",
      "docs": [
        "Buy a fixed-price pNFT listing."
      ],
      "discriminator": [
        26,
        178,
        190,
        138,
        45,
        22,
        144,
        30
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "nft_metadata",
          "writable": true
        },
        {
          "name": "nft_edition"
        },
        {
          "name": "escrow_authority",
          "docs": [
            "Escrow authority PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "escrow_nft_token",
          "writable": true
        },
        {
          "name": "escrow_token_record",
          "writable": true
        },
        {
          "name": "buyer_nft_token",
          "writable": true
        },
        {
          "name": "buyer_token_record",
          "writable": true
        },
        {
          "name": "buyer_payment_account",
          "writable": true
        },
        {
          "name": "seller_payment_account",
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "token_metadata_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "ata_program"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sysvar_instructions"
        },
        {
          "name": "authorization_rules_program",
          "optional": true
        },
        {
          "name": "authorization_rules",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "cancel_core_listing",
      "docs": [
        "Cancel a Core listing (owner only). Revokes the TransferDelegate authority",
        "by removing the plugin, and closes the CoreListing PDA."
      ],
      "discriminator": [
        58,
        30,
        81,
        251,
        75,
        37,
        173,
        211
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "core_listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "core_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "mpl_core_program",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "cancel_listing",
      "docs": [
        "Cancel a listing (seller only, auctions only if no bids)",
        "",
        "For WNS/Token-2022: client MUST include WNS `approve_transfer` (amount=0)",
        "remaining_accounts: same layout as list_item"
      ],
      "discriminator": [
        41,
        183,
        50,
        232,
        230,
        233,
        157,
        70
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "seller_nft_account",
          "writable": true
        },
        {
          "name": "seller",
          "signer": true
        },
        {
          "name": "nft_token_program"
        }
      ],
      "args": []
    },
    {
      "name": "cancel_listing_pnft",
      "docs": [
        "Cancel a pNFT listing \u2014 return NFT to seller."
      ],
      "discriminator": [
        41,
        48,
        179,
        6,
        129,
        16,
        120,
        65
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "nft_metadata",
          "writable": true
        },
        {
          "name": "nft_edition"
        },
        {
          "name": "escrow_authority",
          "docs": [
            "Escrow authority PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "escrow_nft_token",
          "writable": true
        },
        {
          "name": "escrow_token_record",
          "writable": true
        },
        {
          "name": "seller_nft_token",
          "writable": true
        },
        {
          "name": "seller_token_record",
          "writable": true
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_metadata_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "ata_program"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sysvar_instructions"
        },
        {
          "name": "authorization_rules_program",
          "optional": true
        },
        {
          "name": "authorization_rules",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "close_stale_listing",
      "docs": [
        "Close a stale listing where escrow is empty (NFT already returned)",
        "This allows re-listing the same NFT after a cancelled listing"
      ],
      "discriminator": [
        120,
        38,
        229,
        87,
        16,
        1,
        54,
        10
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "nft_token_program"
        }
      ],
      "args": []
    },
    {
      "name": "initialize_treasury",
      "docs": [
        "Initialize the treasury config PDA (one-time setup by deploy authority)"
      ],
      "discriminator": [
        124,
        186,
        211,
        195,
        85,
        165,
        129,
        166
      ],
      "accounts": [
        {
          "name": "treasury_config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "list_core_item",
      "docs": [
        "List a Metaplex Core asset for fixed-price USDC sale."
      ],
      "discriminator": [
        249,
        213,
        18,
        100,
        230,
        110,
        232,
        59
      ],
      "accounts": [
        {
          "name": "seller",
          "docs": [
            "Owner-signed (must equal OWNER_WALLET \u2014 checked in handler)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "payment_mint",
          "docs": [
            "USDC mint (validated in handler)."
          ]
        },
        {
          "name": "core_listing",
          "docs": [
            "CoreListing PDA \u2014 created on list, closed on cancel/buy."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "core_authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  114,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "mpl_core_program",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "price_usdc",
          "type": "u64"
        }
      ]
    },
    {
      "name": "list_item",
      "docs": [
        "List an item for sale (either fixed price or auction)",
        "",
        "For WNS/Token-2022 NFTs: client MUST include a WNS `approve_transfer` IX",
        "(amount=0) BEFORE this instruction in the same transaction.",
        "remaining_accounts for Token-2022:",
        "[0] extra_metas_account PDA (readonly) - seeds: [\"extra-account-metas\", nft_mint]",
        "[1] approve_account PDA (writable) - seeds: [\"approve-account\", nft_mint]",
        "[2] wns_program (readonly)"
      ],
      "discriminator": [
        174,
        245,
        22,
        211,
        228,
        103,
        121,
        13
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "payment_mint"
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "seller_nft_account",
          "writable": true
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "nft_token_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "listing_type",
          "type": {
            "defined": {
              "name": "ListingType"
            }
          }
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "duration_seconds",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "ItemCategory"
            }
          }
        },
        {
          "name": "royalty_basis_points",
          "type": "u16"
        },
        {
          "name": "creator_address",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "list_item_pnft",
      "docs": [
        "List a pNFT (Metaplex programmable NFT) for sale.",
        "Uses Token Metadata TransferV1 CPI with delegate + token_record."
      ],
      "discriminator": [
        236,
        179,
        101,
        29,
        212,
        149,
        190,
        159
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "nft_metadata",
          "writable": true
        },
        {
          "name": "nft_edition"
        },
        {
          "name": "seller_nft_token",
          "writable": true
        },
        {
          "name": "seller_token_record",
          "writable": true
        },
        {
          "name": "escrow_authority",
          "docs": [
            "Escrow authority PDA \u2014 owns the escrow token account"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "nft_mint"
              }
            ]
          }
        },
        {
          "name": "escrow_nft_token",
          "docs": [
            "Escrow token account \u2014 created by Token Metadata via ATA"
          ],
          "writable": true
        },
        {
          "name": "escrow_token_record",
          "docs": [
            "Escrow token record (pNFT programmable config)"
          ],
          "writable": true
        },
        {
          "name": "payment_mint"
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_metadata_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "ata_program"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sysvar_instructions"
        },
        {
          "name": "authorization_rules_program",
          "optional": true
        },
        {
          "name": "authorization_rules",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "listing_type",
          "type": {
            "defined": {
              "name": "ListingType"
            }
          }
        },
        {
          "name": "price",
          "type": "u64"
        },
        {
          "name": "duration_seconds",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "ItemCategory"
            }
          }
        },
        {
          "name": "royalty_basis_points",
          "type": "u16"
        },
        {
          "name": "creator_address",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "place_bid",
      "docs": [
        "Place a bid on an active auction (payment tokens only, no NFT transfer)"
      ],
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "payment_mint",
          "docs": [
            "Payment mint \u2014 must match the listing's payment mint"
          ]
        },
        {
          "name": "bid_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "bidder_token_account",
          "writable": true
        },
        {
          "name": "previous_bidder_account",
          "writable": true
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settle_auction",
      "docs": [
        "Settle an auction after end time",
        "",
        "For WNS/Token-2022: client MUST include WNS `approve_transfer` (amount=0)",
        "remaining_accounts: same layout as list_item"
      ],
      "discriminator": [
        246,
        196,
        183,
        98,
        222,
        139,
        46,
        133
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "nft_mint"
        },
        {
          "name": "bid_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "escrow_nft",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  110,
                  102,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "listing.nft_mint",
                "account": "Listing"
              }
            ]
          }
        },
        {
          "name": "seller_payment_account",
          "docs": [
            "Seller's payment token account \u2014 must be owned by listing.seller"
          ],
          "writable": true
        },
        {
          "name": "treasury_payment_account",
          "docs": [
            "Treasury payment account \u2014 validated in instruction body against treasury_config or fallback"
          ],
          "writable": true
        },
        {
          "name": "creator_payment_account",
          "writable": true
        },
        {
          "name": "buyer_nft_account",
          "docs": [
            "Buyer NFT account \u2014 must be owned by highest bidder (or seller if no bids for return)"
          ],
          "writable": true
        },
        {
          "name": "seller_nft_account",
          "docs": [
            "Seller NFT account \u2014 must be owned by listing.seller (for no-bid return)"
          ],
          "writable": true
        },
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "treasury_config",
          "docs": [
            "Treasury config PDA \u2014 if present, overrides hardcoded treasury address"
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "nft_token_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "update_treasury",
      "docs": [
        "Update treasury address (deploy authority only)"
      ],
      "discriminator": [
        60,
        16,
        243,
        66,
        96,
        59,
        254,
        131
      ],
      "accounts": [
        {
          "name": "treasury_config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_treasury",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "CoreListing",
      "discriminator": [
        205,
        178,
        162,
        169,
        199,
        166,
        133,
        157
      ]
    },
    {
      "name": "Listing",
      "discriminator": [
        218,
        32,
        50,
        73,
        43,
        134,
        26,
        58
      ]
    },
    {
      "name": "TreasuryConfig",
      "discriminator": [
        124,
        54,
        212,
        227,
        213,
        189,
        168,
        41
      ]
    }
  ],
  "events": [
    {
      "name": "AuctionCancelled",
      "discriminator": [
        22,
        32,
        51,
        83,
        215,
        194,
        171,
        209
      ]
    },
    {
      "name": "AuctionSettled",
      "discriminator": [
        61,
        151,
        131,
        170,
        95,
        203,
        219,
        147
      ]
    },
    {
      "name": "BidPlaced",
      "discriminator": [
        135,
        53,
        176,
        83,
        193,
        69,
        108,
        61
      ]
    },
    {
      "name": "CoreListingCancelled",
      "discriminator": [
        165,
        96,
        88,
        242,
        37,
        224,
        205,
        57
      ]
    },
    {
      "name": "CoreListingCreated",
      "discriminator": [
        184,
        108,
        121,
        191,
        52,
        251,
        30,
        84
      ]
    },
    {
      "name": "CorePurchased",
      "discriminator": [
        221,
        82,
        110,
        196,
        235,
        58,
        114,
        17
      ]
    },
    {
      "name": "ItemPurchased",
      "discriminator": [
        33,
        219,
        12,
        58,
        205,
        48,
        63,
        143
      ]
    },
    {
      "name": "ListingCancelled",
      "discriminator": [
        11,
        46,
        163,
        10,
        103,
        80,
        139,
        194
      ]
    },
    {
      "name": "ListingCreated",
      "discriminator": [
        94,
        164,
        167,
        255,
        246,
        186,
        12,
        96
      ]
    },
    {
      "name": "TreasuryUpdated",
      "discriminator": [
        80,
        239,
        54,
        168,
        43,
        38,
        85,
        145
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "ListingNotActive",
      "msg": "Listing is not active"
    },
    {
      "code": 6001,
      "name": "AuctionEnded",
      "msg": "Auction has already ended"
    },
    {
      "code": 6002,
      "name": "AuctionNotEnded",
      "msg": "Auction has not ended yet"
    },
    {
      "code": 6003,
      "name": "BidTooLow",
      "msg": "Bid is too low"
    },
    {
      "code": 6004,
      "name": "CalculationError",
      "msg": "Calculation error"
    },
    {
      "code": 6005,
      "name": "Unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6006,
      "name": "CannotCancelWithBids",
      "msg": "Cannot cancel auction with existing bids"
    },
    {
      "code": 6007,
      "name": "NotAnAuction",
      "msg": "Invalid listing type for this operation"
    },
    {
      "code": 6008,
      "name": "NotFixedPrice",
      "msg": "Invalid listing type for this operation"
    },
    {
      "code": 6009,
      "name": "InvalidDuration",
      "msg": "Invalid duration for auction"
    },
    {
      "code": 6010,
      "name": "InvalidPaymentMint",
      "msg": "Invalid payment mint for this category"
    },
    {
      "code": 6011,
      "name": "InvalidPrice",
      "msg": "Price must be greater than zero"
    },
    {
      "code": 6012,
      "name": "InsufficientWNSAccounts",
      "msg": "Insufficient WNS remaining accounts for Token-2022 transfer"
    },
    {
      "code": 6013,
      "name": "TransferFailed",
      "msg": "Token-2022 transfer with hook failed"
    },
    {
      "code": 6014,
      "name": "SellerCannotBid",
      "msg": "Seller cannot bid on their own auction"
    },
    {
      "code": 6015,
      "name": "InvalidRefundAccount",
      "msg": "Invalid refund account \u2014 must be previous bidder's ATA"
    },
    {
      "code": 6016,
      "name": "RoyaltyTooHigh",
      "msg": "Royalty basis points too high (max 1000 = 10%)"
    },
    {
      "code": 6017,
      "name": "InvalidBuyerAccount",
      "msg": "Invalid buyer account \u2014 must be owned by highest bidder"
    },
    {
      "code": 6018,
      "name": "InvalidCreatorAccount",
      "msg": "Invalid creator account \u2014 must be creator's ATA for payment mint"
    },
    {
      "code": 6019,
      "name": "InvalidTokenProgram",
      "msg": "Invalid token program \u2014 must be SPL Token or Token-2022"
    },
    {
      "code": 6020,
      "name": "InvalidRoyaltyBps",
      "msg": "Invalid royalty basis points \u2014 must be 0 or >= 100 (1%)"
    }
  ],
  "types": [
    {
      "name": "AuctionCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "AuctionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "platform_fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "BidPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "CoreListing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "created_at",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "CoreListingCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "CoreListingCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "price_usdc",
            "type": "u64"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "CorePurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "price_usdc",
            "type": "u64"
          },
          {
            "name": "platform_fee",
            "type": "u64"
          },
          {
            "name": "creator_royalty",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "ItemCategory",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "DigitalArt"
          },
          {
            "name": "Spirits"
          },
          {
            "name": "TCGCards"
          },
          {
            "name": "SportsCards"
          },
          {
            "name": "Watches"
          }
        ]
      }
    },
    {
      "name": "ItemPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "platform_fee",
            "type": "u64"
          },
          {
            "name": "creator_royalty",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Listing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "listing_type",
            "type": {
              "defined": {
                "name": "ListingType"
              }
            }
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "ItemCategory"
              }
            }
          },
          {
            "name": "start_time",
            "type": "i64"
          },
          {
            "name": "end_time",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "ListingStatus"
              }
            }
          },
          {
            "name": "escrow_nft_account",
            "type": "pubkey"
          },
          {
            "name": "current_bid",
            "type": "u64"
          },
          {
            "name": "highest_bidder",
            "type": "pubkey"
          },
          {
            "name": "baxus_fee",
            "type": "bool"
          },
          {
            "name": "is_token2022",
            "type": "bool"
          },
          {
            "name": "is_pnft",
            "type": "bool"
          },
          {
            "name": "royalty_basis_points",
            "type": "u16"
          },
          {
            "name": "creator_address",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "ListingCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ListingCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nft_mint",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "listing_type",
            "type": {
              "defined": {
                "name": "ListingType"
              }
            }
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "ItemCategory"
              }
            }
          },
          {
            "name": "end_time",
            "type": "i64"
          },
          {
            "name": "payment_mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ListingStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Active"
          },
          {
            "name": "Settled"
          },
          {
            "name": "Cancelled"
          }
        ]
      }
    },
    {
      "name": "ListingType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "FixedPrice"
          },
          {
            "name": "Auction"
          }
        ]
      }
    },
    {
      "name": "TreasuryConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "TreasuryUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "old_treasury",
            "type": "pubkey"
          },
          {
            "name": "new_treasury",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
