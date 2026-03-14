import styled from 'styled-components';
import { theme } from '../styles/theme';

export const Grid = styled.div`
  width: 100%;
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto auto;
`;
