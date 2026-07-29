import styled from 'styled-components';
import { theme } from '../styles/theme';

export const Page = styled.main`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* Top padding is modest because SiteHeader now supplies the chrome above. */
  padding: ${theme.spacing.xl} ${theme.spacing.xl} 64px;

  @media (max-width: ${theme.breakpoints.md}) {
    padding: ${theme.spacing.md} ${theme.spacing.md} 48px;
  }
`;
