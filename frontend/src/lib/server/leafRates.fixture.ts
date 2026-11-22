// Leaf's GET /v1/rates answer as leaf.seqwawa.com served it on 2026-11-22, kept
// whole so the guide is tested against what Leaf actually sends.
export const leafRatesFixture = {
  "title": "Leaf rates",
  "description": "What Leaf pays right now. This message updates itself whenever the rates change.",
  "sections": [
    {
      "name": "Raids",
      "text": "**110 / 80 / 60 / 50** Leaf for 3 / 2 / 1 / 0 gambits: 1 Leaf per point of your share of the raid's season rating. When the mod didn't see your gambits, the party's rating is split evenly."
    },
    {
      "name": "Wars",
      "text": "**0.5** Leaf per war point in FFA wars and snipes, **1** per war point when we take back our own claim."
    },
    {
      "name": "Daily quests",
      "text": "One a day, up to 3 banked, so missing days costs nothing. One of:\n• 3 of one raid or 9 wars: **300** Leaf, 150 XP\n• 2 raids or 6 wars: **200** Leaf, 100 XP\n• 300 season rating: **250** Leaf, 125 XP"
    },
    {
      "name": "Weekly quest",
      "text": "Monday to Monday (UTC). One of:\n• 12 of one raid or 60 wars: **800** Leaf, 400 XP\n• 20 raids or 60 wars: **800** Leaf, 400 XP\n• 2,000 season rating: **800** Leaf, 400 XP"
    },
    {
      "name": "Timed quest",
      "text": "A new one every 4 hours (UTC), open for 2, the same for the whole guild. One of:\n• 2 of one raid or 6 wars: **500** Leaf, 250 XP\n• 3 raids or 9 wars: **500** Leaf, 250 XP\n• 300 season rating: **500** Leaf, 250 XP"
    },
    {
      "name": "Raid milestones",
      "text": "Bronze **1,000** · Silver **1,500** · Gold **2,500** · Platinum **10,000** · Diamond **15,000** · Obsidian **30,000** · Mythril **50,000**. No XP."
    },
    {
      "name": "War milestones",
      "text": "Bronze **300** · Silver **500** · Gold **800** · Platinum **3,000** · Diamond **5,000** · Obsidian **10,000** · Mythril **15,000**. No XP."
    },
    {
      "name": "Levels",
      "text": "Raids and wars give as much XP as Leaf, quests the XP they list. Level 2 takes 1,000 XP and each level after it 250 more. Each level pays Leaf: 100 for level 2, 25 more for each one after (300 for level 10)."
    },
    {
      "name": "Quest swaps",
      "text": "Swap a daily or weekly quest you don't fancy: 1 free a day for each, then **100** Leaf a swap."
    },
    {
      "name": "Recent changes",
      "text": "**21 Nov**: Wars pay half their war points, or the full war points when we take back our own claim. Raid milestones pay 1,000 to 50,000 Leaf and war milestones 300 to 15,000, with no XP. Raids still pay by gambits.\n**19 Nov**: Swap a daily or weekly quest: once a day each for free, then 100 Leaf.\n**19 Nov**: Timed quests take the third slot: a new one every 4 hours, open for 2, the same for the whole guild.\n**19 Nov**: Raids pay your own share of the party's season rating, by the gambits you took, instead of the whole party's."
    }
  ],
  "changed_at": "2026-11-21T00:00:00.000Z"
};
