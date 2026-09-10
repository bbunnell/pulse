"use client";

interface Props {
  text: string;
}

/**
 * Small ⓘ icon carrying an explanation.
 *
 * `tabIndex={0}` is the point: this used to be a plain span, so the bubble was
 * reachable by hover only — which is nobody on a phone and nobody using a
 * keyboard. The stylesheet shows it on :focus-visible as well as :hover, and
 * role="note" with the text as its accessible name means a screen reader gets
 * the explanation rather than an unlabelled "i".
 */
export function InfoTooltip({ text }: Props) {
  return (
    <span
      className="info-tooltip-wrap"
      tabIndex={0}
      role="note"
      aria-label={text}
      title={text}
    >
      <span className="info-tooltip-icon" aria-hidden="true">i</span>
      <span className="info-tooltip-bubble" aria-hidden="true">{text}</span>
    </span>
  );
}
