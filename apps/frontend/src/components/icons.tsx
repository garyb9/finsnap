import styled from 'styled-components';
import Link from 'next/link';
import { theme } from '../styles/theme';

/**
 * Small inline icons.
 *
 * The dashboard used to carry text links — "more →", "Field guide →", "what the
 * numbers mean" — which competed with the data for attention in rows that are
 * already dense. An icon says "there is an explanation here" in a fraction of
 * the space, with the wording moved into the tooltip where it costs nothing.
 */

const Svg = styled.svg`
  width: 1em;
  height: 1em;
  flex: none;
  display: block;
`;

export function InfoIcon() {
  return (
    <Svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M12 10.6v6M12 7.4v.9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function BookIcon() {
  return (
    <Svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.2A1.6 1.6 0 0 1 5.6 3.6H19v14H5.6A1.6 1.6 0 0 0 4 19.2V5.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 19.2a1.6 1.6 0 0 0 1.6 1.6H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * An icon that links into the guide.
 *
 * The label is required and becomes the tooltip and the accessible name — an
 * icon with no name is a puzzle, and this one exists precisely to remove
 * puzzlement.
 */
const IconAnchor = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.86rem;
  line-height: 1;
  color: ${theme.colors.label};
  text-decoration: none;
  border-radius: 50%;
  padding: 2px;
  transition: color 0.15s ease;
  vertical-align: middle;

  &:hover {
    color: ${theme.colors.accent};
  }
`;

export function GuideLinkIcon({
  href,
  label,
  variant = 'info',
}: {
  href: string;
  label: string;
  variant?: 'info' | 'book';
}) {
  return (
    <IconAnchor href={href} title={label} aria-label={label}>
      {variant === 'book' ? <BookIcon /> : <InfoIcon />}
    </IconAnchor>
  );
}
