import { useState, useEffect } from "react";

export function useAnalysisVisibility() {
  const [showAnalysis, setShowAnalysis] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("showMarketAnalysis");
    // Default to true if no value is stored
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    localStorage.setItem("showMarketAnalysis", showAnalysis.toString());
  }, [showAnalysis]);

  return [showAnalysis, setShowAnalysis] as const;
}
