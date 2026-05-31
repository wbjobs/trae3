export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-gray-100 border-b border-gray-200" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 border-b border-gray-100 flex items-center px-4 gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-gray-100 rounded flex-1" style={{ opacity: 0.3 + j * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid grid-cols-2 gap-5">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-20" />
            <div className="h-10 bg-gray-100 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="h-24 bg-gray-100 rounded-lg" />
      <div className="h-32 border-2 border-dashed border-gray-200 rounded-lg" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-5 bg-gray-100 rounded" />
        ))}
      </div>
      <div className="h-6 bg-gray-200 rounded w-28" />
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3">
            <div className="w-3 h-3 bg-gray-300 rounded-full mt-1" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-3 bg-gray-100 rounded w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
