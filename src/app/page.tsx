import type { Metadata } from "next";
import { MarketingHomepage } from "@/components/marketing/MarketingHomepage";

export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_APP_URL'] || 'https://app.opendm.in'),
  title: "open-autoDM — Turn Instagram Comments Into Conversations",
  description:
    "Open-source, self-hosted Instagram comment-to-DM automation. Deliver resources, boost engagement, and protect your account with Traffic Guard safeguards.",
  openGraph: {
    title: "open-autoDM — Turn Instagram Comments Into Conversations",
    description:
      "Open-source, self-hosted Instagram comment-to-DM automation. Deliver resources, boost engagement, and protect your account with Traffic Guard safeguards.",
    url: "/",
    type: "website",
  },
};

export default function HomePage() {
  return <MarketingHomepage />;
}
