'use client';

import React from 'react';
import { ExecutionTrace } from '@/types';
import ExecutionTraceComponent from '@/components/chat/ExecutionTrace';

// Sample execution trace data for demonstration
const sampleExecutionTrace: ExecutionTrace = {
  steps: [
    {
      id: '1',
      name: 'Understanding User Query',
      type: 'thought',
      timestamp: '2024-03-27T13:15:00.000Z',
      duration: 150,
      description: 'Analyzing the user query about vault strategies and identifying key requirements',
      details: {
        query: 'What are the best vault strategies for high yield?',
        intent: 'User wants investment recommendations',
        entities: ['vault strategies', 'high yield', 'investment']
      }
    },
    {
      id: '2',
      name: 'Fetching Vault Data',
      type: 'action',
      timestamp: '2024-03-27T13:15:00.150Z',
      duration: 300,
      description: 'Retrieving current vault information and performance data',
      substeps: [
        {
          id: '2.1',
          name: 'Query Vault Registry',
          type: 'tool_call',
          timestamp: '2024-03-27T13:15:00.200Z',
          duration: 120,
          description: 'Calling vault registry API to get available vaults',
          details: {
            tool: 'vault_registry',
            parameters: { include_performance: true },
            result: { vaults_found: 15 }
          }
        },
        {
          id: '2.2',
          name: 'Filter High-Performance Vaults',
          type: 'action',
          timestamp: '2024-03-27T13:15:00.320Z',
          duration: 80,
          description: 'Filtering vaults based on APY and risk metrics',
          details: {
            criteria: { min_apy: 8, max_risk: 'medium' },
            filtered_count: 7
          }
        }
      ]
    },
    {
      id: '3',
      name: 'Analysis and Ranking',
      type: 'thought',
      timestamp: '2024-03-27T13:15:00.450Z',
      duration: 200,
      description: 'Analyzing vault performance metrics and ranking by risk-adjusted returns',
      details: {
        metrics: ['apy', 'tvl', 'volatility', 'risk_score'],
        ranking_method: 'sharpe_ratio_weighted'
      }
    },
    {
      id: '4',
      name: 'Generate Recommendations',
      type: 'result',
      timestamp: '2024-03-27T13:15:01.150Z',
      duration: 100,
      description: 'Creating personalized recommendations based on user preferences',
      details: {
        recommendations: [
          {
            vault_name: 'Stable Yield Plus',
            apy: 12.5,
            risk_level: 'low',
            confidence: 0.95
          },
          {
            vault_name: 'Growth Strategy Alpha',
            apy: 18.2,
            risk_level: 'medium',
            confidence: 0.88
          }
        ]
      }
    }
  ],
  totalTime: 750,
  startTime: '2024-03-27T13:15:00.000Z',
  endTime: '2024-03-27T13:15:01.150Z'
};

export function ExecutionTraceDemo() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Execution Trace Demo</h2>
        <p className="text-gray-400">
          This demonstrates how execution traces will appear when the backend provides agent thought-processes.
        </p>
      </div>
      
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-white mb-2">Sample Agent Response:</h3>
        <div className="text-gray-300">
          Based on your query about high-yield vault strategies, I've analyzed the current market and identified two excellent options:
          
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <strong>🏦 Stable Yield Plus</strong> - 12.5% APY, Low Risk
            <br />
            <strong>📈 Growth Strategy Alpha</strong> - 18.2% APY, Medium Risk
          </div>
        </div>
      </div>

      <ExecutionTraceComponent trace={sampleExecutionTrace} />
      
      <div className="mt-6 text-sm text-gray-400">
        <p><strong>Note:</strong> This is sample data. In production, execution traces will be automatically populated from the backend API response.</p>
      </div>
    </div>
  );
}
