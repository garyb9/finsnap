import styled from 'styled-components';
import { theme } from '../styles/theme';

export const MainContainer = styled.div`
  width: 100%;
  max-width: ${theme.maxWidth.dashboard};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};
`;
