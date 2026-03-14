import styled from 'styled-components';
import { theme } from '../styles/theme';

export const Header = styled.header`
  text-align: center;
  h1 {
    font-size: ${theme.fontSizes['3xl']};
    letter-spacing: 0.06em;
    margin-bottom: ${theme.spacing.xs};
    font-weight: 700;
  }
  p {
    font-size: 0.85rem;
    color: ${theme.colors.textSecondary};
    margin: ${theme.spacing.xs} 0;
  }
`;
