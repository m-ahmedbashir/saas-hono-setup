import type { InfobarContent } from "@/components/ui/infobar";

export const individualsInfoContent: InfobarContent = {
  title: "Platform Individuals",
  sections: [
    {
      title: "Overview",
      description:
        "Every non-staff account on the platform — the complement of Platform Users. Includes people who belong to an organization too: their personal profile and subscription are their own, separate from whatever org they're a member of.",
      links: [],
    },
    {
      title: "Organizations column",
      description:
        "Shows every organization this person is a member of, if any — a person can belong to more than one. Click through to the organization's own detail page for the membership itself (role, joined date).",
      links: [],
    },
    {
      title: "How this is enforced",
      description:
        "The list/detail views call this app's own GET /platform-individuals routes, gated the same admin/support tier as Platform Users. Ban/Unban call Better Auth's admin plugin directly (authClient.admin.banUser/unbanUser) — the same real, immediately-enforced ban the Users page uses, not a placeholder.",
      links: [],
    },
  ],
};
