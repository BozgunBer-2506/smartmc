import { inbox } from "@/content/site";
import { LightSection } from "./section";
import { LightInboxPreview } from "./inbox-preview";

export function LightUnifiedInbox() {
  return (
    <LightSection id="unified-inbox" eyebrow={inbox.eyebrow} title={inbox.title} lede={inbox.lede}>
      <LightInboxPreview />
    </LightSection>
  );
}
