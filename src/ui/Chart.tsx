import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';

interface Props {
  option: echarts.EChartsOption;
  height?: number;
  className?: string;
}

export function Chart({ option, height = 200, className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      inst.current?.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, true);
  }, [option]);

  return <div ref={ref} className={className ?? 'canvas'} style={{ height }} />;
}
