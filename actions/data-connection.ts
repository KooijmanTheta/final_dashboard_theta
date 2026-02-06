'use server';

import sql from '@/lib/db';

// ============================================================================
// Types
// ============================================================================

export interface TableStatus {
  schema: string;
  table_name: string;
  full_name: string;
  row_count: number | null;
  status: 'connected' | 'error' | 'empty';
  error_message?: string;
  last_checked: string;
}

export interface ConnectionSummary {
  database_connected: boolean;
  database_name: string;
  database_host: string;
  connection_error?: string;
  tables: TableStatus[];
  total_tables: number;
  connected_tables: number;
  error_tables: number;
  empty_tables: number;
  last_checked: string;
}

// List of all tables used by the dashboard
const DASHBOARD_TABLES = [
  { schema: 'at_tables', table: 'at_ownership_db_v2', description: 'Ownership Data' },
  { schema: 'at_tables', table: 'at_project_universe_db', description: 'Project Universe' },
  { schema: 'at_tables', table: 'at_vehicle_universe_db', description: 'Vehicle Universe' },
  { schema: 'at_tables', table: 'at_fund_universe_db', description: 'Fund Managers' },
  { schema: 'at_tables', table: 'at_investment_names_db', description: 'Investment Names' },
  { schema: 'at_tables', table: 'at_rounds_db', description: 'Funding Rounds' },
  { schema: 'at_tables', table: 'at_flows_db', description: 'Cash Flows' },
  { schema: 'tbv_db', table: 'fund_mv_db', description: 'Market Values' },
  { schema: 'price_data', table: 'liquid_prices_db', description: 'Token Prices' },
  { schema: 'reports', table: 'project_notes', description: 'Project Notes' },
];

// ============================================================================
// Connection Check Functions
// ============================================================================

/**
 * Test basic database connectivity
 */
async function testConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    await sql`SELECT 1 as test`;
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown connection error'
    };
  }
}

/**
 * Get row count for a specific table
 */
async function getTableRowCount(schema: string, tableName: string): Promise<{ count: number | null; error?: string }> {
  try {
    // Use sql.unsafe for dynamic table names - these are controlled by our code, not user input
    const fullTableName = `${schema}.${tableName}`;
    const result = await sql.unsafe<{ count: number }[]>(
      `SELECT COUNT(*)::integer as count FROM ${fullTableName}`
    );
    return { count: result[0]?.count ?? 0 };
  } catch (error) {
    return {
      count: null,
      error: error instanceof Error ? error.message : 'Query failed'
    };
  }
}

/**
 * Get comprehensive data connection summary
 */
export async function getDataConnectionSummary(): Promise<ConnectionSummary> {
  const now = new Date().toISOString();

  // Test basic connection
  const connectionTest = await testConnection();

  if (!connectionTest.connected) {
    return {
      database_connected: false,
      database_name: process.env.POSTGRES_DB || 'unknown',
      database_host: process.env.POSTGRES_HOST || 'unknown',
      connection_error: connectionTest.error,
      tables: [],
      total_tables: DASHBOARD_TABLES.length,
      connected_tables: 0,
      error_tables: DASHBOARD_TABLES.length,
      empty_tables: 0,
      last_checked: now,
    };
  }

  // Check each table
  const tableStatuses: TableStatus[] = [];

  for (const table of DASHBOARD_TABLES) {
    const fullName = `${table.schema}.${table.table}`;
    const result = await getTableRowCount(table.schema, table.table);

    let status: 'connected' | 'error' | 'empty' = 'connected';
    if (result.error) {
      status = 'error';
    } else if (result.count === 0) {
      status = 'empty';
    }

    tableStatuses.push({
      schema: table.schema,
      table_name: table.table,
      full_name: fullName,
      row_count: result.count,
      status,
      error_message: result.error,
      last_checked: now,
    });
  }

  const connectedTables = tableStatuses.filter(t => t.status === 'connected').length;
  const errorTables = tableStatuses.filter(t => t.status === 'error').length;
  const emptyTables = tableStatuses.filter(t => t.status === 'empty').length;

  return {
    database_connected: true,
    database_name: process.env.POSTGRES_DB || 'unknown',
    database_host: process.env.POSTGRES_HOST || 'unknown',
    tables: tableStatuses,
    total_tables: DASHBOARD_TABLES.length,
    connected_tables: connectedTables,
    error_tables: errorTables,
    empty_tables: emptyTables,
    last_checked: now,
  };
}

/**
 * Quick connection status check (lighter weight)
 */
export async function getQuickConnectionStatus(): Promise<{
  connected: boolean;
  database: string;
  error?: string;
}> {
  const connectionTest = await testConnection();
  return {
    connected: connectionTest.connected,
    database: process.env.POSTGRES_DB || 'unknown',
    error: connectionTest.error,
  };
}

/**
 * Get sample data from a table for debugging
 */
export async function getTableSample(
  schema: string,
  tableName: string,
  limit: number = 5
): Promise<{ data: Record<string, unknown>[]; error?: string }> {
  try {
    // Use sql.unsafe for dynamic table names - these are controlled by our code, not user input
    const fullTableName = `${schema}.${tableName}`;
    const result = await sql.unsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${fullTableName} LIMIT ${limit}`
    );
    return { data: result };
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : 'Query failed'
    };
  }
}
