import { keyframes } from 'styled-components';

export const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

export const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

export const toastIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const toastOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;
