import type { Metadata } from "next";
import { CreateOrganizationView } from "@/features/organization/components/create-organization-view";

export const metadata: Metadata = {
  title: "Create organization",
};

export default function CreateOrganizationPage() {
  return <CreateOrganizationView />;
}
