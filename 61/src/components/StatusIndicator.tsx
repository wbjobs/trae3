interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'alarm';
  size?: number;
}

export default function StatusIndicator({ status, size = 10 }: StatusIndicatorProps) {
  const colorMap = {
    online: 'bg-status-online text-status-online',
    offline: 'bg-status-offline text-status-offline',
    alarm: 'bg-status-alarm text-status-alarm',
  };

  const animMap = {
    online: 'animate-pulse-glow',
    offline: '',
    alarm: 'animate-alarm-flash',
  };

  return (
    <span
      className={`inline-block rounded-full ${colorMap[status]} ${animMap[status]}`}
      style={{ width: size, height: size }}
    />
  );
}
