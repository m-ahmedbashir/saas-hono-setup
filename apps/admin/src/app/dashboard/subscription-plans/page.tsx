import PageContainer from "@/components/layout/page-container";
import SubscriptionPlanListingPage from "@/features/subscription-plans/components/subscription-plan-listing";
import { subscriptionPlansInfoContent } from "@/features/subscription-plans/info-content";
import { SubscriptionPlanFormSheetTrigger } from "@/features/subscription-plans/components/subscription-plan-form-sheet";
import { PlatformAccessGate } from "@/components/platform-access-gate";

export const metadata = {
  title: "Dashboard: Subscription Plans",
};

export default function SubscriptionPlansPage() {
  return (
    <PageContainer
      pageTitle="Subscription Plans"
      pageDescription="The admin-editable plan catalog — shared tiers and custom organization plans, for both billing universes."
      infoContent={subscriptionPlansInfoContent}
      pageHeaderAction={<SubscriptionPlanFormSheetTrigger />}
    >
      <PlatformAccessGate>
        <SubscriptionPlanListingPage />
      </PlatformAccessGate>
    </PageContainer>
  );
}
