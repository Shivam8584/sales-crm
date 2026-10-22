import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { PlaybookKind } from "../../lib/domain/playbook";

type Entry = {
  kind: PlaybookKind;
  title: string;
  tags: string[];
  body: string;
};

/**
 * Starter entries use only what the platform is known to do. Anything that
 * needs a legal, policy or pricing position is a bracketed placeholder for the
 * team to fill in; never ship a placeholder to a customer.
 */
const STARTER: Entry[] = [
  {
    kind: "objection",
    title: "Is this legal?",
    tags: ["legal", "trust"],
    body: `[Add your answer: the company's position on incentivised reviews and creator disclosure, agreed with counsel. Do not improvise on this one.]

What we can say today:
- Every brand is GST-verified before its account exists. There is no GST-less path.
- Billing is by tax invoice, so the money trail is clean on both sides.

If they press on a specific law or marketplace rule, say you will come back in writing rather than guess.`,
  },
  {
    kind: "objection",
    title: "Does Amazon allow this?",
    tags: ["amazon", "policy", "trust"],
    body: `[Add your answer: what Amazon's current policies say about this kind of campaign, and how Hypedrive campaigns are designed around them. Verify against the live policy before quoting.]

What we can say today:
- Campaigns are built around a defined action: a purchase, a barter product, an app install, a check-in or a content post.
- The brand reviews each creator's enrolment before it is approved.

Ask which part worries them (reviews, ratings, account health). The answer changes what to show.`,
  },
  {
    kind: "objection",
    title: "How is this different from Vine / Amazon's own review programs?",
    tags: ["amazon", "competition"],
    body: `[Add your answer: what Vine and Amazon's own programmes cover and exclude today. Check their current terms; do not quote from memory.]

What we can say about Hypedrive:
- The brand sets the campaign: type, number of slots, whether creators join openly or by application, and an end date.
- The brand funds it from a prepaid wallet and can pause it.
- It works across marketplaces, not one.

Keep it to what the brand controls. Do not criticise the other programme without a source.`,
  },
  {
    kind: "objection",
    title: "An agency is cheaper",
    tags: ["pricing", "agency"],
    body: `Do not argue price first. Ask what the agency fee covers: sourcing creators, chasing them, checking deliverables, handling disputes.

Where we are different:
- Creators join campaigns through the platform, so there is no one-by-one outreach to pay for.
- The brand reviews each enrolment itself, with reminders when reviews stall.
- There is no standard rate card. We set the price for each campaign.

[Add your answer: a like-for-like cost comparison, only with real numbers from real quotes. Until then, offer to build one for their case.]`,
  },
  {
    kind: "objection",
    title: "I'm not ready to top up the wallet",
    tags: ["wallet", "pricing"],
    body: `Campaigns are prepaid, so the wallet is how a campaign runs. It helps to be clear about how funding works.

- Two ways to add money: an online top-up, or a bank transfer to the brand's virtual account.
- The brand gets a low-balance alert (default floor is Rs 5,000).
- If the balance runs out the campaign pauses. It does not restart on its own after a top-up; the brand has to resume it.

[Add your answer: minimum first top-up, and whether credit terms exist and for whom.]

Offer to fix a start date together and agree an amount that covers a first small campaign.`,
  },
  {
    kind: "objection",
    title: "We already run influencer campaigns",
    tags: ["influencer", "competition"],
    body: `Good: they know what a creator campaign takes. Ask first:
- Which marketplaces and how many products?
- Who finds the creators, and who checks what they deliver?
- How long does a campaign take to fill?

Where we may fit alongside what they do:
- Campaigns with a fixed number of slots, and a reminder when reviews are stuck.
- Product barter, purchase, app install, check-in or content post campaigns on one platform.

[Add your answer: one concrete example of a brand running both, once you have a real one.]`,
  },
  {
    kind: "battlecard",
    title: "Hypedrive vs doing it yourself (DM-ing creators)",
    tags: ["competition", "diy"],
    body: `Where DIY works
- A handful of creators you already know.
- One product, one marketplace, no deadline.

Where it breaks down
- Filling slots: you chase every creator yourself. On Hypedrive a campaign has slots, can take more sign-ups than slots to allow for drop-outs (default 1.5x), and tracks how full it is.
- Stale sign-ups: enrolments expire after a set period (default 45 days), so abandoned ones do not block slots.
- Review backlog: submissions waiting more than 3 days are flagged, with reminders from day 2.
- Money: DMs mean ad hoc payments. Here it is a prepaid wallet and tax invoices.
- Disputes: there is a dispute process.

How to use it
- Ask how many creators they handled last month and how long the last campaign took to fill.
- If the answer is "three, easily", say DIY is fine today and offer to follow up when it stops being so.

[Add your answer: time or cost saved, only from a real customer.]`,
  },
  {
    kind: "demo",
    title: "Demo for a founder",
    tags: ["demo", "founder"],
    body: `20 minutes. Goal: they see their own first campaign and agree a next step.

0-3 min: their situation
- What do they sell, where, and what are they doing for reviews and reach today?

3-8 min: how a campaign works
- Pick a campaign type: purchase, barter, app install, check-in or content post.
- Slots, open or by application, end date.

8-13 min: control
- They review each creator's enrolment.
- Reminders when reviews stall; a dispute process.

13-16 min: money
- Prepaid wallet, online top-up or bank transfer.
- Low-balance alert; the campaign pauses at zero and needs a resume.
- Do not quote a price. The quote comes afterwards, set for their campaign.

16-20 min: next step
- Agree the account set-up (GST required), the first product and a start date.
- Book the follow-up before hanging up.`,
  },
  {
    kind: "demo",
    title: "Demo for a marketplace manager",
    tags: ["demo", "marketplace"],
    body: `20 minutes. Goal: they see how it fits their daily work across products and teammates.

0-3 min: their catalogue
- Which marketplaces, how many products, which ones need a push?

3-9 min: setting up and running
- Listings per marketplace and campaign types.
- Slots, open or by application, and how full each campaign is.

9-14 min: the daily loop
- Reviewing enrolments, with reminders when they stall.
- What happens when a creator or brand disagrees: the dispute process.

14-17 min: team and money
- Team roles: owner, admin, campaign manager, finance manager, member.
- Who tops up the wallet and who is alerted when it runs low.

17-20 min: next step
- Agree the first product and marketplace and who else should join the follow-up.

Do not quote a price. The quote comes afterwards, set for their campaign.`,
  },
];

export async function insertStarter(
  ctx: MutationCtx,
  memberId: Id<"members">,
): Promise<number> {
  if (await ctx.db.query("playbook").first()) return 0;
  const now = Date.now();
  for (const entry of STARTER) {
    await ctx.db.insert("playbook", {
      ...entry,
      searchText: `${entry.title}\n${entry.body}`,
      updatedAt: now,
      updatedById: memberId,
    });
  }
  return STARTER.length;
}
