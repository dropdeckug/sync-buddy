import { Play, SkipBack, SkipForward, Repeat, Shuffle, Heart, Volume2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export function PlayerBar() {
  return (
    <div className="border-t border-border bg-card/50 backdrop-blur">
      <div className="flex items-center justify-between gap-4 p-4">
        {/* Now Playing Info */}
        <div className="flex items-center gap-3 w-72">
          <div className="w-14 h-14 bg-muted rounded flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">GitHub Folder Sync</p>
            <p className="text-xs text-muted-foreground truncate">Lovable</p>
          </div>
          <Button variant="ghost" size="icon" className="flex-shrink-0">
            <Heart className="w-4 h-4" />
          </Button>
        </div>

        {/* Player Controls */}
        <div className="flex-1 max-w-2xl">
          <div className="flex items-center justify-center gap-4 mb-2">
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button size="icon" className="rounded-full w-10 h-10 bg-white hover:bg-white/90 text-black">
              <Play className="w-5 h-5 fill-black" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <SkipForward className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <Repeat className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10 text-right">0:00</span>
            <Slider defaultValue={[0]} max={100} step={1} className="flex-1" />
            <span className="text-xs text-muted-foreground w-10">3:45</span>
          </div>
        </div>

        {/* Volume and Controls */}
        <div className="flex items-center gap-2 w-72 justify-end">
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <Volume2 className="w-4 h-4" />
          </Button>
          <Slider defaultValue={[70]} max={100} step={1} className="w-24" />
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
