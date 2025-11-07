'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';

interface FileUploadProps {
  taskId: string;
  onFileAnalyzed: (analysis: FileAnalysis) => void;
  onWorkflowSuggested: (suggestions: WorkflowSuggestion[]) => void;
  className?: string;
}

interface FileAnalysis {
  fileId: string;
  fileName: string;
  fileType: string;
  size: number;
  category: {
    primary: string;
    secondary: string;
    confidence: number;
  };
  suggestedWorkflows: WorkflowSuggestion[];
  securityRisk: 'low' | 'medium' | 'high';
  processingTime: number;
}

interface WorkflowSuggestion {
  id: string;
  name: string;
  description: string;
  confidence: number;
  estimatedDuration: number;
  requiredTools: string[];
  automation: {
    canAutomate: boolean;
    automationComplexity: 'simple' | 'medium' | 'complex';
  };
}

export function SmartFileUpload({ 
  taskId, 
  onFileAnalyzed, 
  onWorkflowSuggested, 
  className = '' 
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<FileAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }, []);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      for (const file of files) {
        await uploadAndAnalyzeFile(file);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const uploadAndAnalyzeFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('taskId', taskId);

    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const analysis: FileAnalysis = await response.json();
    
    setUploadedFiles(prev => [...prev, analysis]);
    onFileAnalyzed(analysis);
    onWorkflowSuggested(analysis.suggestedWorkflows);
  };

  const getSecurityRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'high': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getSecurityRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🔴';
      default: return '⚪';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Area */}
      <Card 
        className={`relative border-2 border-dashed transition-colors ${
          dragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="p-8 text-center">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          
          <div className="mb-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Smart File Upload
            </h3>
            <p className="text-sm text-gray-600">
              Drop files here or click to select. AI will analyze and suggest optimal workflows.
            </p>
          </div>

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mb-4"
          >
            {uploading ? 'Processing...' : 'Select Files'}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.gif,.js,.ts,.py,.java,.cpp"
          />

          <div className="text-xs text-gray-500">
            Supported: Documents, Spreadsheets, Images, Code files
          </div>
        </div>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center space-x-2 text-red-700">
            <span>⚠️</span>
            <span className="text-sm">{error}</span>
          </div>
        </Card>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <Card className="p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Processed Files ({uploadedFiles.length})
          </h4>
          
          <div className="space-y-3">
            {uploadedFiles.map((file, index) => (
              <FileAnalysisCard key={index} analysis={file} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FileAnalysisCard({ analysis }: { analysis: FileAnalysis }) {
  const [showDetails, setShowDetails] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSecurityRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'high': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getSecurityRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">
            {analysis.category.primary === 'document' && '📄'}
            {analysis.category.primary === 'image' && '🖼️'}
            {analysis.category.primary === 'data' && '📊'}
            {analysis.category.primary === 'code' && '💻'}
            {analysis.category.primary === 'archive' && '📦'}
          </div>
          
          <div>
            <div className="font-medium text-sm text-gray-900">
              {analysis.fileName}
            </div>
            <div className="text-xs text-gray-600">
              {formatFileSize(analysis.size)} • {analysis.category.primary}/{analysis.category.secondary}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`text-sm ${getSecurityRiskColor(analysis.securityRisk)}`}>
            {getSecurityRiskIcon(analysis.securityRisk)}
          </div>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide' : 'Details'}
          </Button>
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium">Category Confidence:</span>
              <div className="mt-1">
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <div 
                    className="bg-blue-600 h-1 rounded-full"
                    style={{ width: `${analysis.category.confidence * 100}%` }}
                  ></div>
                </div>
                <span className="text-gray-600">
                  {Math.round(analysis.category.confidence * 100)}%
                </span>
              </div>
            </div>
            
            <div>
              <span className="font-medium">Processing Time:</span>
              <div className="text-gray-600">
                {Math.round(analysis.processingTime)}ms
              </div>
            </div>
          </div>

          {analysis.suggestedWorkflows.length > 0 && (
            <div className="mt-3">
              <div className="font-medium text-xs mb-2">Suggested Workflows:</div>
              <div className="space-y-1">
                {analysis.suggestedWorkflows.slice(0, 3).map((workflow, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-white rounded p-2">
                    <div>
                      <div className="font-medium">{workflow.name}</div>
                      <div className="text-gray-600 text-xs">{workflow.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-blue-600">{Math.round(workflow.confidence * 100)}%</div>
                      <div className="text-gray-500">{Math.round(workflow.estimatedDuration / 1000)}s</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}