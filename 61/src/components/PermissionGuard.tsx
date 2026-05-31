import { useAuthStore } from '@/stores/auth-store';

interface Props {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export default function PermissionGuard({ permission, fallback, children }: Props) {
  const hasPermission = useAuthStore((s) => s.hasPermission(permission as any));
  return hasPermission ? children : (fallback ?? null);
}
