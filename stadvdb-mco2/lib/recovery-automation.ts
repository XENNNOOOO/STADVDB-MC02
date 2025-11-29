import { getConnection } from './connections';
import { runRecovery } from './db-recovery';
import type { Connection } from 'mysql2/promise';
import type { NodeName } from './types';

/**
 * AUTOMATED RECOVERY SYSTEM - AUTOMATION MODULE
 *
 * This module provides automated background recovery that continuously monitors
 * database nodes and executes recovery operations when failed nodes come back online.
 *
 * Key Features:
 * - Continuous node health monitoring
 * - Automatic detection of node recovery
 * - Smart recovery triggering based on pending operations
 * - Configurable monitoring intervals
 * - Non-intrusive operation that doesn't impact normal database performance
 */

interface AutomationConfig {
  monitoringInterval: number; // milliseconds
  healthCheckTimeout: number; // milliseconds
  enabled: boolean;
}

interface NodeHealthState {
  [key: string]: {
    isOnline: boolean;
    lastChecked: Date;
    lastStatusChange: Date;
    consecutiveFailures: number;
  };
}

interface RecoveryStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunTime: Date | null;
  lastRunResult: any;
}

class RecoveryAutomation {
  private config: AutomationConfig = {
    monitoringInterval: 30000, // 30 seconds
    healthCheckTimeout: 5000,  // 5 seconds
    enabled: true
  };

  private nodeHealth: NodeHealthState = {};
  private recoveryStats: RecoveryStats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    lastRunTime: null,
    lastRunResult: null
  };

  private monitoringTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(customConfig?: Partial<AutomationConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    // Initialize node health state
    const nodes: NodeName[] = ['central', 'node1', 'node2'];
    nodes.forEach(node => {
      this.nodeHealth[node] = {
        isOnline: false,
        lastChecked: new Date(),
        lastStatusChange: new Date(),
        consecutiveFailures: 0
      };
    });

    console.log('AUTOMATION: Recovery automation system initialized');
  }

  /**
   * Start the automated monitoring and recovery process
   */
  public start(): void {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.isRunning = true;
    console.log(`AUTOMATION: Starting automated recovery monitoring (interval: ${this.config.monitoringInterval}ms)`);

    // Run initial health check
    this.performHealthCheck();

    // Set up recurring monitoring
    this.monitoringTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.monitoringInterval);
  }

  /**
   * Stop the automated monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    console.log('AUTOMATION: Recovery automation stopped');
  }

  /**
   * Perform health check on all nodes and trigger recovery if needed
   */
  private async performHealthCheck(): Promise<void> {
    try {
      console.log('AUTOMATION: Performing health check on all nodes...');

      const nodes: NodeName[] = ['central', 'node1', 'node2'];
      const healthPromises = nodes.map(node => this.checkNodeHealth(node));

      await Promise.all(healthPromises);

      // Check if recovery is needed and execute if necessary
      await this.checkAndExecuteRecovery();

    } catch (error: any) {
      console.error('AUTOMATION: Error during health check:', error.message);
    }
  }

  /**
   * Check the health of a specific node
   */
  private async checkNodeHealth(node: NodeName): Promise<void> {
    let connection: Connection | undefined;
    const currentTime = new Date();

    try {
      connection = await getConnection(node);

      // Simple connectivity test with timeout
      await Promise.race([
        connection.execute('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeout)
        )
      ]);

      await connection.end();

      // Node is healthy
      const wasOffline = !this.nodeHealth[node].isOnline;
      this.nodeHealth[node] = {
        isOnline: true,
        lastChecked: currentTime,
        lastStatusChange: wasOffline ? currentTime : this.nodeHealth[node].lastStatusChange,
        consecutiveFailures: 0
      };

      if (wasOffline) {
        console.log(`AUTOMATION: Node ${node} has come back ONLINE - recovery may be triggered`);
      }

    } catch (error: any) {
      const wasOnline = this.nodeHealth[node].isOnline;
      this.nodeHealth[node] = {
        isOnline: false,
        lastChecked: currentTime,
        lastStatusChange: wasOnline ? currentTime : this.nodeHealth[node].lastStatusChange,
        consecutiveFailures: this.nodeHealth[node].consecutiveFailures + 1
      };

      if (wasOnline) {
        console.log(`AUTOMATION: Node ${node} has gone OFFLINE`);
      }

      if (connection) {
        try {
          await connection.end();
        } catch (err) {
          // Ignore connection cleanup errors
        }
      }
    }
  }

  /**
   * Check if recovery is needed and execute it
   */
  private async checkAndExecuteRecovery(): Promise<void> {
    try {
      // Recovery conditions:
      // 1. At least one node has recently come back online
      // 2. There might be pending sync or replication logs to process

      const recentlyRecoveredNodes = Object.entries(this.nodeHealth)
        .filter(([_, health]) => {
          const timeSinceRecovery = Date.now() - health.lastStatusChange.getTime();
          return health.isOnline && timeSinceRecovery < this.config.monitoringInterval * 2;
        })
        .map(([node, _]) => node);

      if (recentlyRecoveredNodes.length === 0) {
        // No recently recovered nodes, check if we have pending logs anyway
        const hasPendingLogs = await this.checkForPendingLogs();
        if (!hasPendingLogs) {
          return; // No recovery needed
        }
      }

      console.log('AUTOMATION: Recovery conditions met - executing automated recovery...');

      // Execute recovery
      this.recoveryStats.totalRuns++;
      this.recoveryStats.lastRunTime = new Date();

      const recoveryResult = await runRecovery();

      this.recoveryStats.lastRunResult = recoveryResult;

      if (recoveryResult.errors.length === 0) {
        this.recoveryStats.successfulRuns++;
        const totalOperations = recoveryResult.masterToSlaves + recoveryResult.slavesToMaster;
        if (totalOperations > 0) {
          console.log(`AUTOMATION: Recovery completed successfully - ${totalOperations} operations processed`);
        } else {
          console.log('AUTOMATION: Recovery completed - no pending operations found');
        }
      } else {
        this.recoveryStats.failedRuns++;
        console.error('AUTOMATION: Recovery completed with errors:', recoveryResult.errors);
      }

    } catch (error: any) {
      this.recoveryStats.failedRuns++;
      this.recoveryStats.lastRunResult = { error: error.message };
      console.error('AUTOMATION: Recovery execution failed:', error.message);
    }
  }

  /**
   * Check if there are pending logs that need recovery
   */
  private async checkForPendingLogs(): Promise<boolean> {
    try {
      // Check for pending sync logs on replica nodes
      const replicaNodes: ('node1' | 'node2')[] = ['node1', 'node2'];

      for (const node of replicaNodes) {
        if (!this.nodeHealth[node].isOnline) continue;

        try {
          const connection = await getConnection(node);
          const [rows] = await connection.execute('SELECT COUNT(*) as count FROM PENDING_SYNC_LOG');
          await connection.end();

          const count = (rows as any)[0].count;
          if (count > 0) {
            console.log(`AUTOMATION: Found ${count} pending sync logs on ${node}`);
            return true;
          }
        } catch (error) {
          // Node might be down or table might not exist (normal for healthy systems)
        }
      }

      // Check for pending replication logs on central node
      if (this.nodeHealth['central'].isOnline) {
        try {
          const connection = await getConnection('central');
          const [rows] = await connection.execute("SELECT COUNT(*) as count FROM REPLICATION_LOG WHERE status = 'PENDING'");
          await connection.end();

          const count = (rows as any)[0].count;
          if (count > 0) {
            console.log(`AUTOMATION: Found ${count} pending replication logs on central node`);
            return true;
          }
        } catch (error) {
          // Central node might be down or table might not exist
        }
      }

      return false;
    } catch (error) {
      console.error('AUTOMATION: Error checking for pending logs:', error);
      return false;
    }
  }

  /**
   * Get current automation status and statistics
   */
  public getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      nodeHealth: this.nodeHealth,
      stats: this.recoveryStats
    };
  }

  /**
   * Update automation configuration
   */
  public updateConfig(newConfig: Partial<AutomationConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart monitoring with new interval if running
    if (this.isRunning && newConfig.monitoringInterval) {
      this.stop();
      this.start();
    }

    console.log('AUTOMATION: Configuration updated:', this.config);
  }

  /**
   * Force a manual recovery check (useful for testing)
   */
  public async forceRecoveryCheck(): Promise<any> {
    console.log('AUTOMATION: Manual recovery check triggered');
    await this.checkAndExecuteRecovery();
    return this.recoveryStats.lastRunResult;
  }
}

// Global automation instance
let automationInstance: RecoveryAutomation | null = null;

/**
 * Initialize and start the global recovery automation service
 */
export const startRecoveryAutomation = (config?: Partial<AutomationConfig>): void => {
  if (automationInstance) {
    console.log('AUTOMATION: Recovery automation already initialized');
    return;
  }

  automationInstance = new RecoveryAutomation(config);
  automationInstance.start();
};

/**
 * Stop the global recovery automation service
 */
export const stopRecoveryAutomation = (): void => {
  if (automationInstance) {
    automationInstance.stop();
    automationInstance = null;
  }
};

/**
 * Get the status of the global recovery automation service
 */
export const getRecoveryAutomationStatus = () => {
  return automationInstance ? automationInstance.getStatus() : null;
};

/**
 * Update the configuration of the global recovery automation service
 */
export const updateRecoveryAutomationConfig = (config: Partial<AutomationConfig>): void => {
  if (automationInstance) {
    automationInstance.updateConfig(config);
  }
};

/**
 * Force a manual recovery check
 */
export const forceRecoveryCheck = async () => {
  if (automationInstance) {
    return await automationInstance.forceRecoveryCheck();
  }
  throw new Error('Recovery automation not initialized');
};