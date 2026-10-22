import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from "../utils/logger";
import {
  AgentQueryRequest,
  AgentQueryResponse,
  AgentStatus,
  AgentCapabilities,
  AgentHealthCheck,
  AgentTool
} from '@/types/agent';
import agentConfig from '@/config/agent';

/**
 * Direct client service for communicating with the AI Agent backend.
 */
class AgentService {
  private api: AxiosInstance;
  private baseURL: string;
  private isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;

  constructor() {
    this.baseURL = agentConfig.baseURL;
    
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: agentConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    if (agentConfig.enableLogging) {
      this.api.interceptors.request.use(
        (config) => {
          logger.debug(`[AgentService] Making request to: ${config.method?.toUpperCase()} ${config.url}`);
          return config;
        },
        (error) => {
          console.error('[AgentService] Request error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor for error handling
      this.api.interceptors.response.use(
        (response) => {
          logger.debug(`[AgentService] Response received: ${response.status} ${response.config.url}`);
          return response;
        },
        (error) => {
          console.error('[AgentService] Response error:', error);
          this.isConnected = false;
          return Promise.reject(error);
        }
      );
    }
  }

  /**
   * Check if the agent service is available and healthy using a HEAD probe request.
   * Catches errors internally and returns an unhealthy status object without throwing.
   *
   * @returns Promise resolving to `AgentHealthCheck` object indicating health status ('healthy' | 'unhealthy') and metrics.
   */
  async healthCheck(): Promise<AgentHealthCheck> {
    try {
      // Since the experimental backend doesn't have a /health endpoint,
      // we'll try to make a simple request to test connectivity
      // We'll use a HEAD request to avoid authentication issues
      const response = await this.api.request({
        method: 'HEAD',
        url: '/',
        timeout: 5000
      });
      
      this.isConnected = true;
      this.lastHealthCheck = new Date();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          agent: {
            status: 'up',
            responseTime: 0
          }
        },
        system: {
          memory: { used: 0, total: 0, percentage: 0 },
          cpu: { usage: 0 },
          uptime: 0
        }
      };
    } catch (error) {
      this.isConnected = false;
      console.error('[AgentService] Health check failed:', error);
      // Don't throw error, return unhealthy status instead
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          agent: {
            status: 'down',
            responseTime: 0
          }
        },
        system: {
          memory: { used: 0, total: 0, percentage: 0 },
          cpu: { usage: 0 },
          uptime: 0
        }
      };
    }
  }

  /**
   * Get current agent status and connected protocol services status.
   *
   * @returns Promise resolving to `AgentStatus` envelope.
   */
  async getStatus(): Promise<AgentStatus> {
    // Since the experimental backend doesn't have a /status endpoint,
    // we'll return a basic status based on connectivity
    return {
      isOnline: this.isConnected,
      version: '1.0.0',
      uptime: 0,
      lastActivity: new Date().toISOString(),
      activeConnections: 1,
      services: {
        soroswap: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        blend: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        aquarius: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        phoenix: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() },
        database: { isActive: true, isHealthy: true, lastCheck: new Date().toISOString() }
      }
    };
  }

  /**
   * Get available agent capabilities, supported actions, assets, and protocols.
   *
   * @returns Promise resolving to `AgentCapabilities` configuration.
   */
  async getCapabilities(): Promise<AgentCapabilities> {
    // Since the experimental backend doesn't have a /capabilities endpoint,
    // we'll return the capabilities based on the intent agent
    return {
      supportedActions: [
        'transfer_xlm', 'swap', 'lend', 'borrow', 'withdraw', 'repay', 'check_balance', 'get_apy',
        'health_check', 'liquidate', 'claim_rewards', 'add_collateral',
        'remove_collateral', 'deposit_vault', 'withdraw_vault', 'get_vaults',
        'get_vault_positions', 'harvest_vault', 'get_strategies', 'swap_stellar_dex',
        'add_liquidity', 'remove_liquidity'
      ],
      supportedAssets: ['XLM', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'],
      supportedProtocols: ['Soroswap', 'Blend', 'Aquarius', 'Phoenix'],
      features: {
        defi: true,
        crossChain: true,
        voiceCommands: false,
        smartContracts: true,
        yieldFarming: true,
        lending: true,
        borrowing: true,
        swapping: true
      },
      limits: {
        maxQueryLength: 1000,
        maxConcurrentQueries: 10,
        rateLimitPerMinute: 60
      }
    };
  }

  /**
   * Send an intent query to the AI Agent service endpoint (`/query`).
   * Never throws directly on HTTP error; catches exceptions and returns a resolved `AgentQueryResponse` object with `success: false` and a user-friendly error message.
   *
   * @param request - Query request envelope containing user prompt string.
   * @returns Promise resolving to `AgentQueryResponse` (`{ result: { success, data, error, executionTrace } }`).
   *
   * @example
   * ```ts
   * import { agentService } from '@/services/agentService';
   * 
   * const response = await agentService.queryAgent({ query: 'What is my current XLM balance?' });
   * if (response.result.success) {
   *   console.log('Response:', response.result.data);
   * } else {
   *   console.error('Error:', response.result.error);
   * }
   * ```
   */
  async queryAgent(request: AgentQueryRequest, options?: { signal?: AbortSignal }): Promise<AgentQueryResponse> {
    try {
      logger.debug('[AgentService] Sending query:', request.query);
      
      const response = await this.api.post('/query', request, { signal: options?.signal });
      
      logger.debug('[AgentService] Query response:', response.data);
      
      // The experimental backend returns { result: ... } format
      // Ensure we return the proper AgentQueryResponse format
      if (response.data && response.data.result) {
        return {
          result: response.data.result
        };
      }
      
      // Fallback if response format is unexpected
      return {
        result: {
          success: true,
          data: response.data || 'Query processed successfully',
          error: null
        }
      };
    } catch (error: unknown) {
      const axiosError = error as {
        code?: string;
        name?: string;
        message?: string;
        response?: { data?: { message?: string } };
      };
      if (
        axiosError.code === 'ERR_CANCELED' ||
        axiosError.name === 'CanceledError' ||
        axiosError.name === 'AbortError'
      ) {
        throw error;
      }
      console.error('[AgentService] Query failed:', error);

      // Convert technical errors to user-friendly messages
      let friendlyMessage = 'Agent service is currently unavailable. Please try again later.';
      const errorMsg = axiosError.response?.data?.message || axiosError.message || 'Unknown error';
      
      if (errorMsg.includes('invalid query')) {
        friendlyMessage = "I didn't understand that. Could you please rephrase your question?";
      } else if (errorMsg.includes('timeout')) {
        friendlyMessage = "The request is taking longer than expected. Please try again.";
      } else if (errorMsg.includes('network')) {
        friendlyMessage = "I'm having trouble connecting. Please check your internet connection and try again.";
      }
      
      // Return a structured error response
      return {
        result: {
          success: false,
          data: friendlyMessage,
          error: errorMsg
        }
      };
    }
  }

  /**
   * Get conversation memory entries for a specific user ID.
   * Does NOT throw on HTTP failure; logs warning and returns an empty array.
   *
   * @param userId - Target user identifier string.
   * @returns Promise resolving to array of string memory entries.
   */
  async getMemory(userId: string): Promise<string[]> {
    try {
      const response = await this.api.get<string[]>(`/memory/${userId}`);
      return response.data;
    } catch (error) {
      console.error('[AgentService] Failed to get memory:', error);
      return [];
    }
  }

  /**
   * Clear agent memory entries for a specific user ID.
   *
   * @param userId - Target user identifier string.
   * @returns Promise resolving to void when memory deletion completes.
   * @throws {Error} Throws Error with message 'Failed to clear agent memory' if API call fails.
   */
  async clearMemory(userId: string): Promise<void> {
    try {
      await this.api.delete(`/memory/${userId}`);
    } catch (error) {
      console.error('[AgentService] Failed to clear memory:', error);
      throw new Error('Failed to clear agent memory');
    }
  }

  /**
   * Fetch list of available tools and their operational status.
   * Does NOT throw on HTTP error; logs warning and returns an empty array.
   *
   * @returns Promise resolving to array of tool definitions.
   */
  async getTools(): Promise<AgentTool[]> {
    try {
      const response = await this.api.get<AgentTool[]>('/tools');
      return response.data;
    } catch (error) {
      console.error('[AgentService] Failed to get tools:', error);
      return [];
    }
  }

  /**
   * Execute a specific agent tool by name with parameters.
   *
   * @param toolName - Identifier name of the tool to execute.
   * @param params - Parameters payload object for tool execution.
   * @returns Promise resolving to tool execution response output.
   * @throws {Error} Throws Error if tool execution fails.
   */
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.api.post(`/tools/${toolName}/execute`, params);
      return response.data;
    } catch (error) {
      console.error(`[AgentService] Failed to execute tool ${toolName}:`, error);
      throw new Error(`Failed to execute tool: ${toolName}`);
    }
  }

  /**
   * Check if agent is currently marked as connected based on recent health checks or network requests.
   *
   * @returns Synchronous boolean flag (`true` if connected, `false` otherwise).
   */
  isAgentConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Retrieve timestamp of the most recent health check execution.
   *
   * @returns `Date` instance of last health check, or `null` if health check has not been run.
   */
  getLastHealthCheck(): Date | null {
    return this.lastHealthCheck;
  }

  /**
   * Initialize the agent service by executing an initial health check.
   * Catches errors internally and logs a warning without throwing.
   *
   * @returns Promise resolving to void.
   */
  async initialize(): Promise<void> {
    try {
      await this.healthCheck();
      logger.debug('[AgentService] Successfully initialized');
    } catch (error) {
      console.warn('[AgentService] Failed to initialize, will retry on first use');
    }
  }

  /**
   * Generic low-level request method for agent endpoints.
   *
   * @template T - Expected response payload type.
   * @param config - Axios request configuration object.
   * @returns Promise resolving to response data of type T.
   * @throws {AxiosError} Throws on HTTP request error.
   */
  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.api.request<T>(config);
    return response.data;
  }
}

// Create and export a singleton instance
export const agentService = new AgentService();
export default agentService;
