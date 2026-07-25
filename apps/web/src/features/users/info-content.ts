import type { InfobarContent } from "@/components/ui/infobar";

export const usersInfoContent: InfobarContent = {
  title: "Platform Users",
  sections: [
    {
      title: "Overview",
      description:
        "Manage the platform's own staff accounts — admins and support — as distinct from an organization's members. Employees don't self-signup: a platform admin creates their account here and shares the credentials directly. Employees can update their own profile details afterward, but account creation and role/access changes stay admin-controlled.",
      links: [],
    },
    {
      title: "Roles & permissions",
      description:
        "Admin: full platform access (create/list/ban/remove users, change roles, impersonate). Support: read-only (list/view users), for staff who need visibility without the ability to make changes. Roles can be changed at any time from each row's actions menu.",
      links: [],
    },
    {
      title: "How this is enforced",
      description:
        "This page calls Better Auth's admin plugin directly (authClient.admin.*) — there's no separate app API for it. Every action is re-checked server-side against the same role/permission set shown here, so the access gate on this page is a UX convenience, not the security boundary.",
      links: [],
    },
  ],
};
