/**
 * Long, elegant orange curves: each incoming message flows into the OO
 * junction, and one continuing stroke carries the eye from the OO straight
 * into the product panel's left edge — the "messages flow into Looktra"
 * story, not a short local flourish. Fixed pixel coordinates matching the
 * desktop scene's own fixed 1240x760 box exactly (no scaling tricks needed
 * since the scene itself doesn't resize below its xl-only breakpoint).
 */
const INCOMING_PATHS = [
  "M 205 412 C 320 412, 400 466, 488 533",
  "M 333 492 C 390 492, 435 512, 488 533",
  "M 204 606 C 320 606, 420 572, 488 533",
  "M 336 688 C 405 688, 462 618, 488 533",
];

const CONTINUATION_PATH = "M 516 533 C 562 517, 604 485, 648 442";

export function ConnectionPaths({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1240 820" fill="none" aria-hidden>
      {INCOMING_PATHS.map((d, i) => (
        <path
          key={i}
          className="v3-path"
          d={d}
          stroke="var(--v3-orange)"
          strokeWidth="1.75"
          strokeLinecap="round"
          opacity={0.7 - i * 0.06}
          style={{ "--v3-path-length": 420 } as React.CSSProperties}
        />
      ))}
      <path
        className="v3-path"
        d={CONTINUATION_PATH}
        stroke="var(--v3-orange)"
        strokeWidth="2.25"
        strokeLinecap="round"
        opacity={0.85}
        style={{ "--v3-path-length": 420, animationDelay: "0.35s" } as React.CSSProperties}
      />
    </svg>
  );
}
