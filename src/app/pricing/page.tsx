import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/PricingPage";

export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_APP_URL'] || 'https://app.opendm.in'),
  title: "Simple Pricing. More Control. — open-autoDM",
  description:
    "Simple, transparent creator pricing for open-autoDM. Start with a 30-day free trial. Starter at $5/mo, Creator Plus at $9/mo with built-in Traffic Guard protection.",
  openGraph: {
    title: "Simple Pricing. More Control. — open-autoDM",
    description:
      "Simple, transparent creator pricing for open-autoDM. Start with a 30-day free trial. Starter at $5/mo, Creator Plus at $9/mo with built-in Traffic Guard protection.",
    url: "/pricing",
    type: "website",
  },
};

export default function PricingRoute() {
  return <PricingPage />;
}
