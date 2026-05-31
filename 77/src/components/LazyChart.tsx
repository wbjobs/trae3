import { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { Loader } from 'lucide-react';

const MetricChart = lazy(() => import('./MetricChart'));

interface LazyChartProps {
  metric: any;
  data: any[];
  height?: number;
  showLegend?: boolean;
}

export default function LazyChart({ metric, data, height = 300, showLegend = true }: LazyChartProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasLoaded(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  const shouldRender = hasLoaded || isVisible;

  return (
    <div ref={ref} className="min-h-[200px]">
      {shouldRender ? (
        <Suspense fallback={
          <div className="flex items-center justify-center h-[300px] bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow">
            <div className="flex items-center gap-2 text-gray-400">
              <Loader className="w-5 h-5 animate-spin" />
              <span>加载图表中...</span>
            </div>
          </div>
        }>
          <MetricChart
            metric={metric}
            data={data}
            height={height}
            showLegend={showLegend}
          />
        </Suspense>
      ) : (
        <div className="h-[300px] bg-bg-secondary/30 rounded-xl border border-border-glow/30 flex items-center justify-center">
          <div className="text-gray-500 text-sm">向下滚动加载图表</div>
        </div>
      )}
    </div>
  );
}
