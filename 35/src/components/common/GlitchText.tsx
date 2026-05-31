import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface GlitchTextProps {
  children: ReactNode;
  className?: string;
  color?: string;
}

export function GlitchText({ children, className, color = '#00d4ff' }: GlitchTextProps) {
  return (
    <span className={cn('relative inline-block', className)}>
      <span className="relative z-10">{children}</span>
      <span 
        className="absolute top-0 left-0 opacity-70"
        style={{ 
          color,
          clipPath: 'inset(0 0 50% 0)',
          transform: 'translate(-2px, -1px)',
          animation: 'glitch-anim 2s infinite linear alternate-reverse'
        }}
      >
        {children}
      </span>
      <span 
        className="absolute top-0 left-0 opacity-70"
        style={{ 
          color: '#ff6b35',
          clipPath: 'inset(50% 0 0 0)',
          transform: 'translate(2px, 1px)',
          animation: 'glitch-anim2 3s infinite linear alternate-reverse'
        }}
      >
        {children}
      </span>
    </span>
  );
}
