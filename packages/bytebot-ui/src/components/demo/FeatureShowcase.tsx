import React from "react";
import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    icon: "🖱️",
    title: "Desktop Automation",
    description: "Controls mouse, keyboard, and applications just like a human user",
    highlights: ["Click & Type", "Application Control", "File Management"]
  },
  {
    icon: "👁️",
    title: "Computer Vision",
    description: "Sees and understands desktop content through screenshots",
    highlights: ["Screen Reading", "Element Detection", "Visual Navigation"]
  },
  {
    icon: "🧠", 
    title: "AI Decision Making",
    description: "Makes intelligent decisions based on visual feedback and context",
    highlights: ["Problem Solving", "Context Awareness", "Adaptive Learning"]
  },
  {
    icon: "🔄",
    title: "Real-time Interaction",
    description: "Responds to user input and questions during task execution",
    highlights: ["Live Chat", "Status Updates", "Error Recovery"]
  },
  {
    icon: "📝",
    title: "Task Management",
    description: "Organizes, tracks, and manages multiple tasks efficiently",
    highlights: ["Queue Management", "Priority Handling", "Status Tracking"]
  },
  {
    icon: "🔌",
    title: "Multi-Application",
    description: "Works across different applications and web browsers seamlessly",
    highlights: ["Cross-Platform", "Browser Control", "App Integration"]
  }
];

export function FeatureShowcase() {
  return (
    <div className="mb-12">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-bytebot-bronze-dark mb-2">
          Core Capabilities
        </h2>
        <p className="text-bytebot-bronze-light-11 max-w-2xl mx-auto">
          Bytebot combines advanced AI with computer automation to perform complex tasks
          that typically require human interaction.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((feature, index) => (
          <Card key={index} className="p-6 hover:shadow-lg transition-all duration-200">
            <div className="text-3xl mb-4">{feature.icon}</div>
            <h3 className="text-lg font-semibold text-bytebot-bronze-dark mb-2">
              {feature.title}
            </h3>
            <p className="text-sm text-bytebot-bronze-light-11 mb-4">
              {feature.description}
            </p>
            <div className="space-y-1">
              {feature.highlights.map((highlight, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <div className="w-1.5 h-1.5 bg-bytebot-bronze rounded-full"></div>
                  <span className="text-bytebot-bronze-light-10">{highlight}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}