import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import styled from 'styled-components';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toastIn, toastOut } from '../styles/keyframes';
import { theme } from '../styles/theme';

export type ToastTone = 'success' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  show: (tone: ToastTone, title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const Viewport = styled(RadixToast.Viewport)`
  position: fixed;
  bottom: 18px;
  right: 18px;
  z-index: ${theme.zIndex.overlay};
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 32px));
  list-style: none;
  margin: 0;
  padding: 0;
  outline: none;

  @media (max-width: ${theme.breakpoints.md}) {
    right: 10px;
    bottom: 10px;
  }
`;

const Root = styled(RadixToast.Root)<{ $tone: ToastTone }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: ${theme.radius.md};
  border: 1px solid
    ${({ $tone }) => ($tone === 'error' ? theme.colors.danger : theme.colors.success)};
  background: ${theme.colors.codeBackgroundSlate};
  box-shadow: ${theme.colors.shadowSoft};
  backdrop-filter: blur(8px);

  &[data-state='open'] {
    animation: ${toastIn} 0.18s ease;
  }

  &[data-state='closed'] {
    animation: ${toastOut} 0.15s ease;
  }

  svg {
    width: 16px;
    height: 16px;
    flex: none;
    margin-top: 1px;
    color: ${({ $tone }) => ($tone === 'error' ? theme.colors.danger : theme.colors.success)};
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const Title = styled(RadixToast.Title)`
  font-size: 0.8rem;
  font-weight: 700;
  color: ${theme.colors.textSlate};
`;

const Description = styled(RadixToast.Description)`
  font-size: 0.7rem;
  color: ${theme.colors.textMuted};
`;

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, tone, title, description }]);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      <RadixToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <Root
            key={item.id}
            $tone={item.tone}
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
          >
            {item.tone === 'error' ? <XCircle aria-hidden /> : <CheckCircle2 aria-hidden />}
            <Body>
              <Title>{item.title}</Title>
              {item.description && <Description>{item.description}</Description>}
            </Body>
          </Root>
        ))}
        <Viewport />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
