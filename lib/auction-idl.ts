export const IDL = {
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
        "Buy a fixed-price listing immediately"
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
          "name": "escrow_nft",
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
          "name": "buyer_nft_account",
          "writable": true
        },
        {
          "name": "buyer",
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
        }
      ],
      "args": []
    },
    {
      "name": "cancel_listing",
      "docs": [
        "Cancel a listing (seller only, auctions only if no bids)"
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
          "name": "escrow_nft",
          "writable": true
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
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "list_item",
      "docs": [
        "List an item for sale (either fixed price or auction)"
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
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
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
        }
      ]
    },
    {
      "name": "place_bid",
      "docs": [
        "Place a bid on an active auction"
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
        "Settle an auction after end time"
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
          "name": "buyer_nft_account",
          "writable": true
        },
        {
          "name": "seller_nft_account",
          "writable": true
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
    }
  ],
  "accounts": [
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
    }
  ]
} as const;
