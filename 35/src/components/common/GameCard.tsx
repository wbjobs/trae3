import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface GameCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
}

export function GameCard({ children, className, hover = true, glow = false }: GameCardProps) {
  return (
    <div className={cn(
      'relative bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700',
      hover && 'hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10',
      glow && 'shadow-lg shadow-cyan-500/20 border-cyan-500/30',
      className
    )}>
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none rounded-lg" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      <div className="relative p-4">
        {children}
      </div>
    </div>
  );
}
