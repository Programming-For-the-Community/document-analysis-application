import { ReactNode } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ModalOverlayProps {
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

// Backdrop shared by every modal: clicking outside the card or pressing Escape
// closes it. The click target is a real (but untabbable — Escape is the keyboard
// path) button layered behind the card, styled by .modal-backdrop in base.css.
export function ModalOverlay({ className = 'modal-overlay', onClose, children }: Readonly<ModalOverlayProps>) {
  useEscapeKey(onClose);

  return (
    <div className={className}>
      <button type="button" className="btn-plain modal-backdrop" tabIndex={-1} aria-label="Close" onClick={onClose} />
      {children}
    </div>
  );
}
