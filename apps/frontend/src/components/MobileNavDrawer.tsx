import * as Dialog from '@radix-ui/react-dialog';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { theme } from '../styles/theme';
import { NavList } from './NavList';

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: ${theme.zIndex.overlay};
  background: rgba(0, 0, 0, 0.6);
`;

const Content = styled(Dialog.Content)`
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: ${theme.zIndex.overlay};
  width: min(80vw, 280px);
  display: flex;
  flex-direction: column;
  background: ${theme.colors.backgroundElevated};
  border-right: 1px solid ${theme.colors.borderSlate};
  box-shadow: ${theme.colors.shadowSoft};
  outline: none;
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 14px;
  border-bottom: 1px solid ${theme.colors.borderSlate};
`;

const Title = styled(Dialog.Title)`
  font-family: ${theme.fonts.heading};
  font-size: 0.9rem;
  font-weight: 700;
  color: ${theme.colors.text};
  margin: 0;
`;

const CloseButton = styled.button`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: ${theme.colors.label};

  &:hover {
    color: ${theme.colors.accent};
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

export interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNavDrawer({ open, onOpenChange }: MobileNavDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Overlay />
        <Content aria-describedby={undefined}>
          <Head>
            <Title>Navigate</Title>
            <Dialog.Close asChild>
              <CloseButton type="button" aria-label="Close">
                <X aria-hidden />
              </CloseButton>
            </Dialog.Close>
          </Head>
          <NavList collapsed={false} onNavigate={() => onOpenChange(false)} />
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
