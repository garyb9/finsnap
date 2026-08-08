import styled from 'styled-components';
import { theme } from '../styles/theme';

export const Page = styled.main`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-left: var(--sidebar-width, 240px);
  width: calc(100% - var(--sidebar-width, 240px));
  transition: margin-left 0.18s ease;
  padding: ${theme.spacing.xl} ${theme.spacing.xl} 64px;

  @media (max-width: ${theme.breakpoints.md}) {
    margin-left: 0;
    width: 100%;
    padding: ${theme.spacing.md} ${theme.spacing.md} 48px;
  }
`;
