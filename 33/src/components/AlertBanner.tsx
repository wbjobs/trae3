import { AlertTriangle, X } from 'lucide-react';
import { useAlertStore } from '@/stores/alertStore';
import { useState } from 'react';

export default function AlertBanner() {
  const { alerts } = useAlertStore();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const activeAlerts = alerts.filter(a => !a.read && !dismissed.has(a.id));
  const topAlert = activeAlerts[0];

  if (!topAlert) return null;

  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-sm ${
      topAlert.type === 'transfer_timeout' ? 'bg-amber-50 border border-amber-200' :
      topAlert.type === 'lab_capacity' ? 'bg-red-50 border border-red-200' :
      'bg-orange-50 border border-orange-200'
    }`}>
      <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${
        topAlert.type === 'transfer_timeout' ? 'text-amber-500' :
        topAlert.type === 'lab_capacity' ? 'text-red-500' :
        'text-orange-500'
      }`} />
      <p className={`flex-1 text-sm ${
        topAlert.type === 'transfer_timeout' ? 'text-amber-700' :
        topAlert.type === 'lab_capacity' ? 'text-red-700' :
        'text-orange-700'
      }`}>
        {topAlert.content}
      </p>
      <button onClick={() => setDismissed(prev => new Set(prev).add(topAlert.id))} className="text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
