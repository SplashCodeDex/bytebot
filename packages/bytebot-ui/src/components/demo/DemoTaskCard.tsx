import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";

interface DemoTask {
  id: string;
  title: string;
  description: string;
  category: string;
  estimatedTime: string;
  features: string[];
  icon: string;
  complexity: "Easy" | "Medium" | "Advanced";
}

interface DemoTaskCardProps {
  demo: DemoTask;
  isSelected: boolean;
  isCreating: boolean;
  onSelect: () => void;
}

const complexityColors = {
  Easy: "bg-green-100 text-green-800",
  Medium: "bg-yellow-100 text-yellow-800", 
  Advanced: "bg-red-100 text-red-800"
};

export function DemoTaskCard({ demo, isSelected, isCreating, onSelect }: DemoTaskCardProps) {
  return (
    <Card className={`relative overflow-hidden transition-all duration-200 hover:shadow-lg cursor-pointer ${
      isSelected ? "ring-2 ring-bytebot-bronze shadow-lg" : ""
    }`}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{demo.icon}</div>
            <div>
              <h3 className="font-semibold text-bytebot-bronze-dark">{demo.title}</h3>
              <span className="text-sm text-bytebot-bronze-light-11">{demo.category}</span>
            </div>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${complexityColors[demo.complexity]}`}>
            {demo.complexity}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-bytebot-bronze-light-11 mb-4 line-clamp-2">
          {demo.description}
        </p>

        {/* Features */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-1">
            {demo.features.map((feature, index) => (
              <span 
                key={index}
                className="px-2 py-1 bg-bytebot-bronze-light-3 text-bytebot-bronze-dark rounded text-xs"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        {/* Time Estimate */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-bytebot-bronze-light-11">
            ⏱️ {demo.estimatedTime}
          </span>
        </div>

        {/* Action Button */}
        <Button 
          onClick={onSelect}
          disabled={isCreating}
          className="w-full"
          variant={isSelected ? "default" : "outline"}
        >
          {isCreating ? (
            <>
              <Loader size={16} className="mr-2" />
              Creating Task...
            </>
          ) : (
            "Try This Demo"
          )}
        </Button>
      </div>

      {/* Loading Overlay */}
      {isCreating && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <div className="text-center">
            <Loader size={32} className="mx-auto mb-2" />
            <p className="text-sm text-bytebot-bronze-light-11">Creating task...</p>
          </div>
        </div>
      )}
    </Card>
  );
}