# NFT Trading Bot

> **⚠️ Disclaimer**
>
> This repository is published as a professional work sample and serves as evidence that the system described below was designed and developed. It contains only a sanitized portion of the project's execution layer and **does not constitute the full bot logic.** The upstream collection-selection / machine-learning models and the Twitter/X announcement scraper are proprietary components that have been intentionally excluded. The material herein is provided solely for demonstration and verification purposes and is not intended to operate as a complete or functioning system.

## Contributors

Developed from 2022–2026 by a small remote team, led by [@Immersified](https://github.com/Immersified):

- **Shola Ayeni** — [@ayenisholah](https://github.com/ayenisholah)
- **Immersified** — [@Immersified](https://github.com/Immersified) (lead)
- **Stefan** — [@FinalDayz](https://github.com/FinalDayz)
- **Alexis**

> _Note: this repository was published as a sanitized work-sample with a fresh commit history, so the GitHub contribution graph does not reflect each member's original commit volume._

## Overview

An automated, multi-marketplace NFT trading bot that places and manages **collection offers and listings on the Ethereum mainnet**. It consumes a collection-selection feed (per-collection bid factors and floor prices) and autonomously bids, lists, and accepts offers across OpenSea, Blur, and Magic Eden — plus Bitcoin Ordinals — while persisting order state and respecting marketplace rate limits.

## What it does

- **Places collection offers on Ethereum mainnet** — constructs and signs [Seaport](https://github.com/ProjectOpenSea/seaport) orders, manages WETH / Blur Pool balances, and submits bids driven by per-collection `factor` × `floor_price` inputs.
- **Operates across multiple marketplaces** from one codebase: OpenSea, Blur, Magic Eden, and Bitcoin Ordinals — bidding, listing, and accepting the best offers on each.
- **Reverse-engineers marketplace web queries** to obtain data the public APIs don't expose, and to fetch in a single request what the official REST API needed ~100 calls for (see [Architecture notes](#reverse-engineered-marketplace-access)).
- **Reacts in real time** to a marketplace event stream over WebSocket, re-pricing and counter-bidding as floors and offers move.
- **Persists order/offer state** in a local database (Prisma + SQLite) so positions survive restarts.


## Algorithm System
The algorithm starts with scraping top collections in terms of volume. Here, metrics like floor price, sale activity, number of tokens and holders (see Figure 1) are used to filter the initial wave of collections.

<p align="center">
  <img width="600" alt="Main Filter" src="https://github.com/user-attachments/assets/154ca7ab-2c50-48a0-80b3-61ac91331f05" />
  <br>
  <em>Figure 1: Combined collection metrics after initial filtering wave. On top, the number of collections the bot would bit on are seen. Below, metrics like the percentage difference between the floor price and highest offer price are shown
    including ETH & WETH merket volume, Bid / Ask ratio (ETH / WETH) and the Ethereum price.</em>
</p>

From the 1000 collections, about 20 go through a more rigorous filter with varying metrics to determine a collection's performance. Here, one can think of price slope filters, collection listings, number of buyers and sellers, ask-to-bid ratio and floor price changes.
Results of these metrics are fed to a random forest classifier which determines the confidence on whether to place a bid on the collection. If the threshold is met, the offer price is determined in combination with the floor price and most recent sale prices.
The final collections are extracted into a CSV file and sent to the bot.

### Calibration
To adjust settings to the market accordingly, the bot is calibrated weekly. Here, the most optimal random forest classifier including offer price metrics are calculated.
This is done by scraping NFT sales from own plus other wallets with the collection variables attached during the purchase period. Afterward, a grid-search is executed to find the best classifier and metrics.
A result of such can be seen in Figure 2, here, the optimization system applies a combination of total profit gained plus win rate to determine the most suitable algorithm.

<p align="center">
  <img width="900" alt="Calibration Comparison" src="https://github.com/user-attachments/assets/0cbf0b70-5e10-422d-b8c4-5ee86268628c" />
  <br>
  <em>Figure 2: Performance comparison of random forest models between the current and previous calibration.</em>
</p>

The calibration system has numerous intricacies like a walk-forward system with specific train and testing periods. Moreover, the data set used always nets to break-even in terms of profit to ensure it is non-biased.


## Tech stack

| Area | Technology |
|------|------------|
| Language | TypeScript (Node.js) |
| Chain / signing | `ethers` v5, Seaport order components |
| Persistence | Prisma ORM + SQLite |
| Concurrency / rate limiting | `bottleneck`, `p-queue` |
| Realtime | `ws` (marketplace event stream) |
| Data inputs | CSV-driven collection config (`csv-parser`) |

## Repository layout

```
src/
  bid.ts, bid_new.ts, continuosBidding.ts, parallel.ts   # bidding entry points / loops
  list.ts, ordinals.ts                                    # listing + ordinals entry points
  websocket.ts                                            # realtime event stream consumer
  functions/                                              # marketplace logic
    offer.ts, list.ts, collection.ts
    magiceden/                                            # Magic Eden integrations
    ordinals/                                             # Bitcoin Ordinals integrations
  utils/                                                  # Seaport payloads, balances, gas, signing
    seaport.ts, payload.ts, proList.ts, fees.ts
    graphql/query/                                        # reverse-engineered marketplace queries
  api/nfttools.ts                                         # marketplace data proxy client
  config/                                                 # env-backed configuration
prisma/schema.prisma                                      # Offer / collection models
Bidding/, Listing/, Settings/                             # collection-selection inputs (CSV)
```

### Reverse-engineered marketplace access

Marketplaces gate much of their richest data (trait floors, signed-order flows, pro listing endpoints) behind their web clients rather than their public APIs. This bot reconstructs those web queries directly — for example the OpenSea Pro listing/auth flow (`utils/proList.ts`) and the GraphQL queries under `utils/graphql/query/` — so it can read trait-level and collection-level data the REST API does not return, and collapse what was ~100 paginated REST calls into a single request.

## Configuration

All credentials are read from environment variables — **no secrets are committed**. Copy `.env.example` to `.env` and fill in your own keys:

| Variable | Purpose |
|----------|---------|
| `ALCHEMY_API_KEY` | Ethereum RPC provider |
| `OPENSEA_API_KEY` | OpenSea REST + stream access |
| `API_KEY` | NFTTools data proxy key |
| `PRIVATE_KEY` | Trading wallet signing key |
| `INFURIA_KEY` | Fallback RPC provider (optional) |
| `X_API_KEY` | Extra marketplace key (optional) |

Collection targets are defined in the `Bidding/`, `Listing/`, and `Settings/` CSV files (`names`, `factor`, `floor_price`, fee overrides).

## Running

```bash
npm install
npx prisma migrate dev      # initialize the local SQLite store
npm run bid                 # run the bidding engine
npm run listing             # run the listing engine
npm run websocket           # run the realtime stream consumer
```

See `package.json` for the full set of entry points (`bid:new`, `bid:parallel`, `bid:continuous`, `bid:ordinals`, `listing:new`).

## Project context

Built and maintained from 2022–2026 with a small remote engineering team (up to 3 concurrent contributors). The system maintained profitability through a ~90% drop in NFT market volume by adapting its collection-selection model and execution strategy.

## Disclaimer

Published as a portfolio/work-sample. Provided as-is, with no warranty. Automated on-chain trading carries financial risk; use at your own risk and supply your own credentials.
