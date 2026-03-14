import styled from 'styled-components';
import { theme } from '../styles/theme';

export const Page = styled.main`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${theme.spacing['2xl']} ${theme.spacing.xl} 64px;
`;
