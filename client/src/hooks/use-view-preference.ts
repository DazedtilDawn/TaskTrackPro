import { useState, useEffect } from "react";

type ViewType = "grid" | "list" | "table";

export function useViewPreference(defaultView: ViewType = "grid") {
  const [view, setView] = useState<ViewType>(() => {
    const savedView = localStorage.getItem("viewPreference");
    return (savedView as ViewType) || defaultView;
  });

  useEffect(() => {
    localStorage.setItem("viewPreference", view);
  }, [view]);

  return [view, setView] as const;
}
