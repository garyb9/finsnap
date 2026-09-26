import styled, { css } from 'styled-components';
import { shimmer } from '../styles/keyframes';
import { theme } from '../styles/theme';

const shimmerCss = css`
  background: linear-gradient(
    90deg,
    ${theme.colors.slateOverlay} 25%,
    ${theme.colors.slateOverlayStrong} 50%,
    ${theme.colors.slateOverlay} 75%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.6s ease-in-out infinite;
`;

export const SkeletonBlock = styled.div<{ $width?: string; $height?: string; $radius?: string }>`
  width: ${({ $width }) => $width ?? '100%'};
  height: ${({ $height }) => $height ?? '16px'};
  border-radius: ${({ $radius }) => $radius ?? theme.radius.sm};
  ${shimmerCss}
`;

export const SkeletonText = styled(SkeletonBlock).attrs({ $height: '12px' })`
  border-radius: 4px;
`;

export const SkeletonCircle = styled(SkeletonBlock)<{ $size?: string }>`
  width: ${({ $size }) => $size ?? '32px'};
  height: ${({ $size }) => $size ?? '32px'};
  border-radius: 50%;
`;
