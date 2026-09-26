import styled from 'styled-components';
import { theme } from '../styles/theme';

/** Fills the page's own width (viewport minus the sidebar) — no separate cap of its own. */
export const MainContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};
`;
