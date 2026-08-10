---
title: "UAT sign-off is a promise, not a formality"
description: "What launching door-to-door digital services across 64 districts taught me about the difference between a signature and a commitment."
date: 2026-08-02
lang: en
tags: ["delivery", "UAT", "go-live"]
---

There is a version of UAT sign-off that is a ritual: the date arrives, the test summary is circulated, someone senior signs, and everyone moves on to launch planning. The signature marks the end of testing.

Then there is the version we ran for D2D — a nationwide door-to-door platform consolidating SIM services, FWA, MNP, ownership transfer and device ordering. There, the signature meant something specific: *the person signing had watched their own team's scenarios pass, on the real integration, with the real rider-assignment logic running behind it.*

## Why the distinction matters at scale

With one office and one team, a ritual sign-off is survivable — the gap between "signed" and "actually works" gets discovered quickly and fixed quietly.

Across 64 districts and 500+ thanas, that gap becomes a field-operations incident. A flow that half-works doesn't fail in a meeting room where you can patch it; it fails in front of a customer, with a rider standing at a doorstep, at the far end of the country.

## Three rules we held

1. **Scenarios come from the operating teams, not the project team.** The project team writes what should work. Field operations writes what actually happens — the mid-flow cancellation, the wrong NID, the customer who changes the order at the door.
2. **The signer attends the failures, not just the summary.** Anyone can sign a green report. The commitment forms when you've watched your scenario break on Tuesday and pass on Thursday.
3. **Sign-off has an expiry date.** If launch slips past a material change to the platform, the sign-off ages out. Painful — and far cheaper than discovering the interaction in production.

Same-day fulfilment for orders placed before noon, across every district, was not the product of heroic launch-week firefighting. It was the product of a signature that meant what it said.
