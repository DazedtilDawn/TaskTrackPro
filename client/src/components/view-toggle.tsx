import { LayoutGrid, List, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  view: "grid" | "list" | "table";
  onViewChange: (view: "grid" | "list" | "table") => void;
  className?: string;
}

export default function ViewToggle({ view, onViewChange, className }: ViewToggleProps) {
  return (
    <div className={cn("flex items-center gap-1 p-1 bg-secondary/20 rounded-lg", className)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8",
          view === "grid" && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange("grid")}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8",
          view === "list" && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange("list")}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8",
          view === "table" && "bg-background shadow-sm"
        )}
        onClick={() => onViewChange("table")}
      >
        <Table2 className="h-4 w-4" />
      </Button>
    </div>
  );
}