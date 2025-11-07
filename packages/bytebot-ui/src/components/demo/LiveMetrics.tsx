"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";

interface MetricData {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: string;
}

export function LiveMetrics() {
  const [metrics, setMetrics] = useState<MetricData[]>([
    { label: "Active Tasks", value: 0, icon: "⚡", trend: "neutral" },
    { label: "Completed Today", value: 0, icon: "✅", trend: "up" },
    { label: "Success Rate", value: "0%", icon: "🎯", trend: "up" },
    { label: "Avg. Task Time", value: "0m", icon: "⏱️", trend: "down" },
    { label: "Desktop Uptime", value: "0%", icon: "🖥️", trend: "up" },
    { label: "Demo Interactions", value: 0, icon: "👥", trend: "up" }
  ]);

  // Simulate live data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => prev.map(metric => {
        switch (metric.label) {
          case "Active Tasks":
            return { ...metric, value: Math.floor(Math.random() * 5) + 1 };
          case "Completed Today":
            return { ...metric, value: Math.floor(Math.random() * 20) + 15 };
          case "Success Rate":
            return { ...metric, value: `${Math.floor(Math.random() * 10) + 90}%` };
          case "Avg. Task Time":
            return { ...metric, value: `${Math.floor(Math.random() * 5) + 3}m` };
          case "Desktop Uptime":
            return { ...metric, value: `${Math.floor(Math.random() * 5) + 95}%` };
          case "Demo Interactions":
            return { ...metric, value: Math.floor(Math.random() * 50) + 100 };
          default:
            return metric;
        }
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case "up": return "📈";
      case "down": return "📉";
      default: return "➡️";
    }
  };

  const getTrendColor = (trend?: string) => {
    switch (trend) {
      case "up": return "text-green-600";
      case "down": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  return (
    <div className="mb-12">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-bytebot-bronze-dark mb-2">
          Live System Metrics
        </h2>
        <p className="text-bytebot-bronze-light-11 text-sm">
          Real-time performance indicators updated every few seconds
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metrics.map((metric, index) => (
          <Card key={index} className="p-4 text-center hover:shadow-md transition-all duration-200">
            <div className="text-2xl mb-2">{metric.icon}</div>
            <div className="text-2xl font-bold text-bytebot-bronze-dark mb-1">
              {metric.value}
            </div>
            <div className="text-xs text-bytebot-bronze-light-11 mb-2">
              {metric.label}
            </div>
            {metric.trend && (
              <div className={`text-xs flex items-center justify-center gap-1 ${getTrendColor(metric.trend)}`}>
                <span>{getTrendIcon(metric.trend)}</span>
                <span>Live</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}