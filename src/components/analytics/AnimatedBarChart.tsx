import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface AnimatedBarChartProps {
  data: any[];
  dataKey: string;
  xAxisKey: string;
  title?: string;
  colors?: string[];
  horizontal?: boolean;
}

export function AnimatedBarChart({ 
  data, 
  dataKey, 
  xAxisKey,
  title,
  colors = ["hsl(var(--primary))"],
  horizontal = false
}: AnimatedBarChartProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const chartConfig: ChartConfig = {
    [dataKey]: {
      label: title || dataKey,
      color: colors[0],
    },
  };

  const getColor = (index: number) => {
    return colors[index % colors.length];
  };

  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 10, right: 10, left: horizontal ? 60 : 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
          {horizontal ? (
            <>
              <XAxis type="number" className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis 
                dataKey={xAxisKey} 
                type="category" 
                className="text-xs fill-muted-foreground" 
                tickLine={false} 
                axisLine={false}
                width={55}
              />
            </>
          ) : (
            <>
              <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
              <YAxis className="text-xs fill-muted-foreground" tickLine={false} axisLine={false} />
            </>
          )}
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar 
            dataKey={dataKey} 
            radius={[4, 4, 0, 0]}
            animationDuration={1200}
            animationEasing="ease-out"
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color || getColor(index)}
                opacity={isVisible ? 1 : 0}
                style={{ transition: `opacity 0.5s ease ${index * 0.1}s` }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
