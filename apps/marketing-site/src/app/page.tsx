import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { Hero } from "@/components/sections/hero";
import { Partners } from "@/components/sections/partners";
import { Problem } from "@/components/sections/problem";
import { Solution } from "@/components/sections/solution";
import { IdentityGraph } from "@/components/sections/identity-graph";
import { UnifiedInbox } from "@/components/sections/unified-inbox";
import { Automation } from "@/components/sections/automation";
import { Architecture } from "@/components/sections/architecture";
import { Security } from "@/components/sections/security";
import { Roadmap } from "@/components/sections/roadmap";
import { Faq } from "@/components/sections/faq";
import { Cta } from "@/components/sections/cta";

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <Partners />
        <Problem />
        <Solution />
        <IdentityGraph />
        <UnifiedInbox />
        <Automation />
        <Architecture />
        <Security />
        <Roadmap />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
