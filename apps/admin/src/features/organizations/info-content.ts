import type { InfobarContent } from "@/components/ui/infobar";

export const organizationsInfoContent: InfobarContent = {
  title: "Platform Organizations",
  sections: [
    {
      title: "Overview",
      description:
        "Every organization registered on the platform — not just ones you personally belong to. A lookup tool for platform admins/support: who owns each org, how many members it has, its plan and billing status.",
      links: [],
    },
    {
      title: "Creating an organization",
      description:
        "\"Create Organization\" provisions a brand-new owner account (you set the password and share it with the company directly — there's no invite email) together with the organization, for a customer who doesn't have one yet. Admin-only; support can view but not create.",
      links: [],
    },
    {
      title: "How this is enforced",
      description:
        "This page calls this app's own GET/POST /platform-organizations routes, gated by requirePlatformPermission on the same admin/support tier as Platform Users — not Better Auth's organization plugin, which only ever returns or creates within the caller's own memberships.",
      links: [],
    },
  ],
};
