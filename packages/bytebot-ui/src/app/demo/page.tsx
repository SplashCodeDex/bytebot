"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/tasks/TaskList";
import { DemoTaskCard } from "@/components/demo/DemoTaskCard";
import { FeatureShowcase } from "@/components/demo/FeatureShowcase";
import { LiveMetrics } from "@/components/demo/LiveMetrics";
import { TaskStatus, TaskType, TaskPriority, Role } from "@/types";

const DEMO_TASKS = [
  {
    id: "demo-1",
    title: "Web Research & Data Collection",
    description: "Research top 10 AI companies and compile their information into a spreadsheet",
    category: "Research",
    estimatedTime: "5-8 minutes",
    features: ["Web browsing", "Data extraction", "Spreadsheet creation"],
    icon: "🔍",
    complexity: "Medium"
  },
  {
    id: "demo-2", 
    title: "Email Management",
    description: "Sort through emails, prioritize important ones, and draft responses",
    category: "Communication",
    estimatedTime: "3-5 minutes",
    features: ["Email processing", "Text analysis", "Response drafting"],
    icon: "📧",
    complexity: "Easy"
  },
  {
    id: "demo-3",
    title: "Image Processing & Analysis",
    description: "Analyze uploaded images, extract text, and create a summary report",
    category: "Analysis",
    estimatedTime: "2-4 minutes", 
    features: ["OCR", "Image analysis", "Report generation"],
    icon: "🖼️",
    complexity: "Easy"
  },
  {
    id: "demo-4",
    title: "Code Review & Documentation",
    description: "Review code files, identify issues, and generate documentation",
    category: "Development",
    estimatedTime: "10-15 minutes",
    features: ["Code analysis", "Bug detection", "Documentation"],
    icon: "💻",
    complexity: "Advanced"
  },
  {
    id: "demo-5",
    title: "Social Media Management",
    description: "Create and schedule social media posts across multiple platforms",
    category: "Marketing",
    estimatedTime: "6-10 minutes",
    features: ["Content creation", "Multi-platform posting", "Scheduling"],
    icon: "📱",
    complexity: "Medium"
  },
  {
    id: "demo-6",
    title: "Financial Data Analysis",
    description: "Analyze financial reports and create visualization dashboards",
    category: "Finance",
    estimatedTime: "8-12 minutes",
    features: ["Data analysis", "Chart creation", "Report generation"],
    icon: "📊",
    complexity: "Advanced"
  }
];

export default function DemoPage() {
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const handleDemoSelect = async (demoId: string) => {
    setSelectedDemo(demoId);
    setIsCreatingTask(true);
    
    const demo = DEMO_TASKS.find(d => d.id === demoId);
    if (!demo) return;

    try {
      // Create actual task for demo
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `[DEMO] ${demo.description}`,
          type: TaskType.IMMEDIATE,
          priority: TaskPriority.MEDIUM
        })
      });

      if (response.ok) {
        const task = await response.json();
        // Redirect to task page
        window.location.href = `/tasks/${task.id}`;
      }
    } catch (error) {
      console.error("Failed to create demo task:", error);
    } finally {
      setIsCreatingTask(false);
      setSelectedDemo(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bytebot-bronze-light-1 to-bytebot-bronze-light-2">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-bytebot-bronze to-bytebot-bronze-dark">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative px-6 py-16 mx-auto max-w-7xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4">
              Bytebot Demo Dashboard
            </h1>
            <p className="text-xl text-bytebot-bronze-light-2 mb-8 max-w-3xl mx-auto">
              Experience the power of AI automation. Watch Bytebot complete complex tasks 
              across multiple applications with natural language instructions.
            </p>
            <div className="flex justify-center gap-4">
              <Button 
                size="lg" 
                className="bg-white text-bytebot-bronze hover:bg-bytebot-bronze-light-1"
              >
                Start Interactive Demo
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white/10"
              >
                View Documentation
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-12 mx-auto max-w-7xl">
        {/* Live Metrics */}
        <LiveMetrics />

        {/* Feature Showcase */}
        <FeatureShowcase />

        {/* Demo Tasks Grid */}
        <div className="mb-12">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-bytebot-bronze-dark mb-2">
              Interactive Demos
            </h2>
            <p className="text-bytebot-bronze-light-11">
              Click any demo below to see Bytebot in action. Each demo showcases different capabilities.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DEMO_TASKS.map((demo) => (
              <DemoTaskCard
                key={demo.id}
                demo={demo}
                isSelected={selectedDemo === demo.id}
                isCreating={isCreatingTask && selectedDemo === demo.id}
                onSelect={() => handleDemoSelect(demo.id)}
              />
            ))}
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="p-6">
            <TaskList 
              limit={5} 
              title="Recent Demo Tasks"
              description="Tasks created from demo interactions"
            />
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Start Guide</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-bytebot-bronze rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
                <div>
                  <h4 className="font-medium">Choose a Demo</h4>
                  <p className="text-sm text-bytebot-bronze-light-11">Select from pre-built scenarios or create your own task</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-bytebot-bronze rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
                <div>
                  <h4 className="font-medium">Watch Bytebot Work</h4>
                  <p className="text-sm text-bytebot-bronze-light-11">Observe real-time execution with desktop screenshots</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-bytebot-bronze rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
                <div>
                  <h4 className="font-medium">Interact & Guide</h4>
                  <p className="text-sm text-bytebot-bronze-light-11">Provide feedback or additional instructions as needed</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}