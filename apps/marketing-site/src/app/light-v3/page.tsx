import { LightV3Nav } from "@/components/light-v3-proto/nav";
import { LightV3Hero } from "@/components/light-v3-proto/hero";
import { LightV3Identity } from "@/components/light-v3-proto/identity-section";
import { LightV3Context } from "@/components/light-v3-proto/context-section";
import { LightV3Automation } from "@/components/light-v3-proto/automation-section";
import { LightV3GettingStarted } from "@/components/light-v3-proto/getting-started-section";
import { LightV3Cta } from "@/components/light-v3-proto/cta-section";
import { LightV3Footer } from "@/components/light-v3-proto/footer";

/**
 * Light v3 — navbar, hero, Identity, Context, Automation and Getting
 * Started are approved and locked; see the design-prototype conversation.
 * This page now also carries the final CTA and footer, plus corrected
 * navbar/hero anchor targets pointing at this page's real section ids.
 * Not linked from the live site. Reachable only at /light-v3.
 */
export default function LightV3Page() {
  return (
    <>
      <LightV3Nav />
      <main>
        <LightV3Hero />
        <LightV3Identity />
        <LightV3Context />
        <LightV3Automation />
        <LightV3GettingStarted />
        <LightV3Cta />
      </main>
      <LightV3Footer />
    </>
  );
}
