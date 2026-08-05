import type { InfobarContent } from "@/components/ui/infobar";

export const subscriptionPlansInfoContent: InfobarContent = {
  title: "Subscription Plans",
  sections: [
    {
      title: "Overview",
      description:
        "The admin-editable plan catalog for both billing universes — organization (seat-based) and individual. Replaces the old hardcoded plan tiers: create/edit shared tiers, or a custom negotiated plan for one organization only, without a deploy.",
      links: [],
    },
    {
      title: "What admins can and can't change",
      description:
        "Toggle known features and set known limits per plan — the underlying catalog of what's togglable is fixed in code, not free text, so a feature can't be turned on that the app has no way to actually enforce. There's no delete: retiring a plan means deactivating it, which only blocks new checkouts and leaves existing subscribers untouched.",
      links: [],
    },
    {
      title: "Default plan and price changes",
      description:
        "Exactly one shared plan per type is the default new signups resolve to with no billing row yet — deactivating or un-defaulting the current default is blocked until another plan takes over. Editing a plan's Stripe Price ID never changes what existing subscribers are billed, only what the next checkout uses.",
      links: [],
    },
  ],
};
