import { useEffect, useRef } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY > 80) {
      onClose();
      startYRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    startYRef.current = null;
  };

  if (!isOpen) return null;

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div
        className="bottom-sheet"
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="bottom-sheet-handle" />
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}