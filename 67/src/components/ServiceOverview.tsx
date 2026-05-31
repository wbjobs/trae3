import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitorStore'
import type { NodeStatus, ServiceInfo, NodeInfo } from '../../shared/types'

const statusDot: Record<NodeStatus, string> = {
  healthy: 'bg-ops-accent',
  warning: 'bg-ops-warning',
  critical: 'bg-ops-critical',
}

const statusGlow: Record<NodeStatus, string> = {
  healthy: 'shadow-[0_0_6px_rgba(6,214,160,0.5)]',
  warning: 'shadow-[0_0_6px_rgba(245,158,11,0.5)]',
  critical: 'shadow-[0_0_6px_rgba(239,68,68,0.5)]',
}

const serviceStatusColor: Record<NodeStatus, string> = {
  healthy: 'text-ops-accent',
  warning: 'text-ops-warning',
  critical: 'text-ops-critical',
}

function NodeDot({ node }: { node: NodeInfo }) {
  return (
    <div
      className={cn(
        'w-3 h-3 rounded-full transition-all',
        statusDot[node.status],
        statusGlow[node.status]
      )}
      title={`${node.id}: ${node.status}`}
    />
  )
}

function ServiceCard({ service }: { service: ServiceInfo }) {
  return (
    <div className="bg-ops-card border border-ops-border rounded-xl p-4 transition-all hover:border-ops-accent/30 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-ops-text text-sm font-semibold truncate">{service.name}</h4>
        <span
          className={cn(
            'text-[10px] font-mono uppercase font-bold',
            serviceStatusColor[service.status]
          )}
        >
          {service.status}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-ops-muted text-xs mb-3">
        <span className="font-mono">{service.nodes.length}</span>
        <span>nodes</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {service.nodes.map((node) => (
          <NodeDot key={node.id} node={node} />
        ))}
      </div>
    </div>
  )
}

export default function ServiceOverview() {
  const services = useMonitorStore((s) => s.services)

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-ops-text text-sm font-semibold">Service Topology</h3>
        <span className="text-ops-muted text-xs font-mono">{services.length} services</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {services.map((svc) => (
          <ServiceCard key={svc.name} service={svc} />
        ))}
      </div>
      {services.length === 0 && (
        <div className="flex items-center justify-center h-24 text-ops-muted text-sm">
          No services found
        </div>
      )}
    </div>
  )
}
