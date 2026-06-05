"use client";

interface Props {
  text: string;
}

/**
 * Small ⓘ icon that shows an explanatory tooltip on hover.
 * Pure CSS — no state needed.
 */
export function InfoTooltip({ text }: Props) {
  return (
    <span className="info-tooltip-wrap" title={text} aria-label={text}>
      <span className="info-tooltip-icon">i</span>
      <span className="info-tooltip-bubble">{text}</span>
    </span>
  );
}
