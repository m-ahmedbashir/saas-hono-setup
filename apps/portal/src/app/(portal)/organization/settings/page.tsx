import type { Metadata } from "next";
import { OrganizationSettingsView } from "@/features/organization/components/organization-settings-view";

export const metadata: Metadata = {
  title: "Organization settings",
};

export default function OrganizationSettingsPage() {
  return <OrganizationSettingsView />;
}
