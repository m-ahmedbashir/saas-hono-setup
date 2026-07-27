import { delay } from "@/constants/mock-api-users";
import { BarGraph } from "@/features/overview/components/bar-graph";

export default async function BarStats() {
  await delay(1000);

  return <BarGraph />;
}
