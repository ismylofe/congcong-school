import NumberSenseReview from "./NumberSenseReview";
import { ComingSoonPage } from "@/components/ComingSoonPage";
import { isNumberSensePublished } from "@/lib/numberSensePublished";
export default async function Page() {
  if (!(await isNumberSensePublished())) return <ComingSoonPage title="數一數、比一比" />;
  return <NumberSenseReview />;
}
