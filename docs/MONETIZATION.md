# 🐾 Pawse — Monetization Plan

> **Status: future work (Phase 7).** Noted now so every earlier decision (accounts, feature flags, room size limits) is built monetization-aware and we don't have to retrofit. **We build and perfect the FREE plan first.** Nothing here gets built until the free product has real users.
>
> **Guiding rule:** the free plan stays genuinely useful and free **forever** — a room of 2 is the origin story and the top of the funnel. We never charge the couple who inspired this. Money comes from **groups, power features, and cosmetics** — things the free user doesn't need but a power user or friend-group wants.

---

## 1. Why this can make money

- **Real recurring use** — people watch together every week. Weekly habit = low churn = good LTV.
- **Emotional product** — long-distance couples and friend groups pay for connection. Cosmetics (cat packs) sell on feeling, not utility → pure margin.
- **Near-zero marginal cost** — sync is bytes, own-files is P2P. Our server cost per extra user is tiny, so even cheap plans are profitable.
- **India-first pricing** — cheap, high-volume, PPP-adjusted. A ₹99 plan at scale beats a $10 plan nobody in the target market buys.

---

## 2. The tiers (cat-themed)

Four tiers. Free is the hook; Plus is the volume seller; Pro is the power tier; Lifetime is the anchor + cashflow.

| | 🐾 **Kitten** (Free) | 😺 **Tabby** (Plus) | 🐆 **Panther** (Pro) | 🐈‍⬛ **Nine Lives** (Lifetime) |
|---|---|---|---|---|
| **Price (India)** | ₹0 forever | ₹99/mo · **₹799/yr** | ₹249/mo · **₹1,999/yr** | **₹2,999 one-time** |
| **Price (Intl)** | $0 | $3/mo · $24/yr | $6/mo · $49/yr | $79 one-time |
| Room of 2 (couple) | ✅ | ✅ | ✅ | ✅ |
| YouTube + non-DRM sync | ✅ | ✅ | ✅ | ✅ |
| DRM sync (both logins) | ✅ | ✅ | ✅ | ✅ |
| Own-files P2P | ✅ (720p) | ✅ (1080p) | ✅ (4K/native) | ✅ (4K/native) |
| Cam + chat + reactions | ✅ basic | ✅ + reaction packs | ✅ + HD cam | ✅ all |
| **Group rooms** | — | up to **4** | up to **10** | up to **10** |
| Scheduled movie dates | 1 active | unlimited | unlimited | unlimited |
| Watch history / stats | last 5 | full + "wrapped" | full + export | full + export |
| Cat sprite packs / themes | 1 (default) | all packs | all packs + early | all + exclusive |
| TURN relay priority (better connect on bad NAT) | best-effort | standard | priority | priority |
| Custom room links (`pawse.tv/us`) | — | — | ✅ | ✅ |
| Remove "made with Pawse" badge | — | ✅ | ✅ | ✅ |
| Priority support | — | — | ✅ | ✅ founder |

**Anchoring:** always show monthly *next to* annual with "save ~33%". Lifetime sits at the top as the "smart money" option — makes ₹1,999/yr look reasonable and pulls cashflow forward.

---

## 3. What stays free forever (non-negotiable)

The couple's core experience: **room of 2, YouTube + own-files sync, cam, chat, reactions, the pixel-cat UI.** If a feature is essential to two people watching a movie together, it's free. We gate *scale* (groups), *polish* (4K, custom links, packs), and *convenience* (unlimited schedules, full history) — never the core.

This generosity IS the growth engine: free users invite partners/friends → some of those want groups or cosmetics → they convert.

---

## 4. Conversion tactics (honest persuasion, no illegal dark patterns)

Strong, proven tactics — but all **legal and store-compliant** (Play/App Store reject dark patterns, and chargebacks kill accounts). We persuade; we don't trick.

**Use these:**
- **Value-first free tier** — let them fall in love before any ask. Reciprocity does the selling.
- **Contextual upsell at the moment of desire** — the ask appears exactly when they hit the wall: try to add a 3rd person → *"Invite the whole gang with Tabby — from ₹99."* Converts far better than a generic pricing page.
- **Annual anchoring** — monthly shown beside annual with the savings highlighted; most pick annual.
- **Founder's / early-bird pricing** — first N users lock a low rate for life. Real scarcity (genuinely time-limited), creates urgency honestly.
- **Lifetime deal** — anchors the subscriptions and front-loads cash to fund development.
- **Streaks & milestones** — *"You & Kitty have watched 42 movies 🐾"* → emotional attachment → a "Wrapped" recap (Plus) they want to share → viral loop.
- **Referral loop** — invite a friend, both get a free month of Plus. Turns users into a sales force.
- **Free 7-day Pro trial** — let them taste 4K + groups, then choose (with a clear, upfront reminder before it ends).
- **Cosmetics as impulse buys** — cheap cat packs (₹49–99) sold on emotion; low price = no deliberation.

**Never (legal + trust + store risk):**
- ❌ Hidden or surprise auto-renewal — always disclose clearly, email before charging.
- ❌ Fake countdowns / fake "only 2 left" — real scarcity only.
- ❌ Hard-to-cancel / dark-pattern cancellation — one-click cancel. (Also the law in many regions.)
- ❌ Charging for anything that was free — never take back the core.

Honest persuasion keeps chargebacks low, stores happy, and word-of-mouth positive — which is worth more than any trick.

---

## 5. Payments & infra (Phase 7)

- **Razorpay** (India: UPI, cards, netbanking) + **Stripe** (international). Both support subscriptions + one-time.
- **This is where a database finally enters** the project: `users`, `subscriptions`, `entitlements`. Until now Pawse needs no DB (rooms are ephemeral). Keep it that way until monetization.
- **Entitlements, not plan-name checks** — gate features on capability flags (`canGroupRooms`, `maxRoomSize`, `native4k`) so plans stay flexible.
- Server stays cheap; only add paid infra (TURN servers for Pro relay priority) once revenue covers it.

---

## 6. Distribution (Phase 8, far future — just tracked)

- **Chrome Web Store** — the extension (free + paid tiers via account login).
- **Desktop app** (Electron/Tauri) for own-files mode — Microsoft Store / Mac App Store.
- **Mobile** (Capacitor / React Native) — Play Store / App Store.
- All legal: own-files + users' own accounts only. No bundled content, no DRM circumvention. Store review is why the "no dark patterns" rule in §4 matters.

---

## 7. Rough numbers (sanity check, not a forecast)

At a 2–3% free→paid conversion (typical for freemium) and mostly annual/Plus:

- 10,000 free users → ~250 paying → ~₹2–3L/yr gross. Small.
- 100,000 free users → ~2,500 paying + cosmetics → ~₹25–35L/yr. Real side income.

The lever is **top-of-funnel free growth** (referrals, "Wrapped" sharing, the couple's word-of-mouth), not squeezing price. Cheap + viral + emotional beats expensive + gated.
