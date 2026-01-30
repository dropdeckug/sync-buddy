import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeatmapData {
  day: string;
  hour: number;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
  title?: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ActivityHeatmap({ data, title }: ActivityHeatmapProps) {
  const [visibleCells, setVisibleCells] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    // Animate cells appearing with wave effect
    const cells = new Set<string>();
    let index = 0;
    
    const interval = setInterval(() => {
      if (index >= DAYS.length * HOURS.length) {
        clearInterval(interval);
        return;
      }
      
      const day = Math.floor(index / HOURS.length);
      const hour = index % HOURS.length;
      cells.add(`${day}-${hour}`);
      setVisibleCells(new Set(cells));
      index++;
    }, 10);
    
    return () => clearInterval(interval);
  }, []);

  const getCount = (dayIndex: number, hour: number) => {
    const dayName = DAYS[dayIndex];
    const entry = data.find(d => d.day === dayName && d.hour === hour);
    return entry?.count || 0;
  };

  const maxCount = Math.max(...data.map(d => d.count), 1);

  const getOpacity = (count: number) => {
    if (count === 0) return 0.1;
    return 0.2 + (count / maxCount) * 0.8;
  };

  const getColor = (count: number) => {
    if (count === 0) return "bg-muted";
    return "bg-primary";
  };

  return (
    <div className="space-y-3">
      {title && <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>}
      
      {/* Time labels */}
      <div className="flex gap-1 ml-10">
        {[0, 6, 12, 18, 23].map(hour => (
          <div 
            key={hour} 
            className="text-[10px] text-muted-foreground"
            style={{ marginLeft: hour === 0 ? 0 : `${(hour - (hour > 0 ? [0, 6, 12, 18][Math.floor(hour / 6) - 1] || 0 : 0)) * 12 - 10}px` }}
          >
            {hour === 0 ? "12am" : hour === 12 ? "12pm" : hour < 12 ? `${hour}am` : `${hour - 12}pm`}
          </div>
        ))}
      </div>
      
      {/* Heatmap grid */}
      <div className="space-y-1">
        {DAYS.map((day, dayIndex) => (
          <div key={day} className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground w-8">{day}</span>
            <div className="flex gap-[2px]">
              {HOURS.map(hour => {
                const count = getCount(dayIndex, hour);
                const isVisible = visibleCells.has(`${dayIndex}-${hour}`);
                
                return (
                  <Tooltip key={hour}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-[10px] h-[10px] rounded-[2px] transition-all duration-300 cursor-pointer hover:ring-1 hover:ring-primary ${getColor(count)}`}
                        style={{ 
                          opacity: isVisible ? getOpacity(count) : 0,
                          transform: isVisible ? "scale(1)" : "scale(0)",
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{day} at {hour}:00 - {count} syncs</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-2 mt-4">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0.1, 0.3, 0.5, 0.7, 1].map((opacity, i) => (
          <div
            key={i}
            className="w-[10px] h-[10px] rounded-[2px] bg-primary"
            style={{ opacity }}
          />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}
