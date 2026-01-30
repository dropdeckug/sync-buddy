import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface AnimatedAreaChartProps {
  data: any[];
  dataKey: string;
  xAxisKey: string;
  title?: string;
  color?: string;
  gradientId?: string;
}

export function AnimatedAreaChart({ 
  data, 
  dataKey, 
  xAxisKey, 
  title,
  color = "hsl(var(--primary))",
  gradientId = "colorGradient"
}: AnimatedAreaChartProps) {
  const [animatedData, setAnimatedData] = useState<any[]>([]);
  
  useEffect(() => {
    // Animate data points appearing one by one
    const animateIn = async () => {
      setAnimatedData([]);
      for (let i = 0; i <= data.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        setAnimatedData(data.slice(0, i));
      }
    };
    
    if (data.length > 0) {
      animateIn();
    }
  }, [data]);

  const chartConfig: ChartConfig = {
    [dataKey]: {
      label: title || dataKey,
      color: color,
    },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={animatedData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
          <XAxis 
            dataKey={xAxisKey} 
            className="text-xs fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            className="text-xs fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
