# SOUL.md

This file explains what Calcutta SmartBid is trying to be so future work does not drift into generic dashboard software.

## Core Idea

Calcutta SmartBid is not a bracket game and not a passive analytics site. It is a live decision-support system for a syndicate leader in the middle of a fast-moving auction.

The product succeeds when it helps the operator make a better bid decision in seconds, with enough confidence to act in the room.

## Primary User

The primary user is the auction operator for one syndicate.

This person is:

- under time pressure
- making decisions out loud in front of other buyers
- balancing expected value against portfolio collision risk
- tracking who owns what and how much money is left in the room

Everything in the app should be optimized around that reality.

## Secondary Users

- syndicate teammates watching the same board
- analysts who want to inspect auction outcomes after the event
- future operators reusing the tool in later tournaments

Secondary users matter, but they should not make the main live workflow slower or noisier.

## Product Principles

### Fast over ornate

The operator needs immediate signals, not a dense research interface. Any new feature should justify its screen space during a live nomination.

### Recommendations must be explainable

The user should be able to answer:

- why is the max bid what it is
- why did it change
- what risk is driving caution

Opaque scores without drivers are not enough.

### Portfolio context matters

A team is not valuable in isolation. Owning teams that likely collide early changes the real value of a bid. The app should keep modeling ownership exposure, not just pure team EV.

### Purchases are the truth

Auction state should be anchored around completed purchases and current live nomination state. The product is not trying to be a perfect tick-by-tick bid history recorder in v1.

### Recovery matters

Live auction software cannot be fragile. Refreshing the page, reconnecting, or reopening the session should not lose the room.

## UX Truths

- the operator should always know the currently nominated team
- current bid and recommended max should be visible at a glance
- the ledger should answer "who owns what" and "how much do they have left"
- viewer mode should feel synchronized but never editable
- validation errors should be domain language, not raw schema text

## What This App Is Not

- not a generic sports betting interface
- not a fantasy dashboard
- not a data warehouse first
- not a full auctioneer bid-tape replay product

Those may inform future features, but they are not the product center.

## Near-Term Product Direction

The strongest next product improvements are:

1. stronger auth and session-role safety
2. better live-room correction workflows
3. richer explanation of recommendation changes
4. better external projection ingestion and override UX

## Quality Bar

Before shipping a change, ask:

- does this make a live auction decision easier or safer
- does it preserve fast operator flow
- does it keep persisted state trustworthy
- does it improve explanation instead of adding noise

If the answer is no, the feature is probably off-center.
