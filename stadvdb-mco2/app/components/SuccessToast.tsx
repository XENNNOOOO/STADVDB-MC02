'use client';

import { CheckCircle2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SuccessToastProps {
  message: string;
  onClose?: () => void;
  duration?: number;
}

export default function SuccessToast({ message, onClose, duration = 3000 }: SuccessToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div className="bg-green-50 border-2 border-green-200 rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[300px]">
        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
        <p className="text-sm font-medium text-green-800 flex-1">{message}</p>
        <button
          onClick={() => {
            setIsVisible(false);
            onClose?.();
          }}
          className="text-green-600 hover:text-green-800 transition"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
