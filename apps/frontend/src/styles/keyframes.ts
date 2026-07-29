import { keyframes } from 'styled-components';

export const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

export const spin = keyframes`
  to { transform: rotate(360deg); }
`;
