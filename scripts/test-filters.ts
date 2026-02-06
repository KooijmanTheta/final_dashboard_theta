/**
 * Test script for filter data structure validation
 * Run with: npx tsx scripts/test-filters.ts
 *
 * Tests:
 * 1. Fund managers query returns expected structure
 * 2. Investment names filtered by fund manager
 * 3. Portfolio dates for test vehicles
 * 4. Validates test vehicles: DRAGON-VEN-III, POLYCH-VEN-II, CRUCIB-VEN-I
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import postgres from 'postgres';

const sql = postgres({
  host: process.env.POSTGRES_HOST!,
  port: parseInt(process.env.POSTGRES_PORT!),
  database: process.env.POSTGRES_DB!,
  username: process.env.POSTGRES_USER!,
  password: process.env.POSTGRES_PASSWORD!,
  ssl: 'require',
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});
import * as fs from 'fs';

const LOG_FILE = path.join(__dirname, '..', 'dashboard_debug.log');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logEntry);
}

async function testFundManagers() {
  log('\n=== TEST: Fund Managers Query ===');
  try {
    const result = await sql`
      SELECT DISTINCT
        fund_id as fund_manager_id,
        fund_id as fund_manager_name
      FROM at_tables.at_fund_universe_db
      WHERE fund_id IS NOT NULL
      ORDER BY fund_id
      LIMIT 10
    `;
    log(`SUCCESS: Found ${result.length} fund managers (showing first 10)`);
    result.forEach((fm: any, i: number) => {
      log(`  ${i + 1}. ${fm.fund_manager_name} (ID: ${fm.fund_manager_id})`);
    });

    // Check for test fund managers
    const testManagers = ['Dragonfly Capital', 'Polychain Capital', 'Crucible Capital'];
    const allResults = await sql`
      SELECT fund_id FROM at_tables.at_fund_universe_db
      WHERE fund_id IN ${sql(testManagers)}
    `;
    log(`\nTest fund managers found: ${allResults.length}/${testManagers.length}`);
    return true;
  } catch (error) {
    log(`ERROR: ${error}`);
    return false;
  }
}

async function testInvestmentNames(fundManagerId: string) {
  log(`\n=== TEST: Investment Names for "${fundManagerId}" ===`);
  try {
    const result = await sql`
      SELECT DISTINCT
        i.vehicle_id as investment_name_id,
        i.full_investment_name as investment_name,
        i.vehicle_id,
        COALESCE(v.vintage, 0)::int as vintage
      FROM at_tables.at_investment_names_db i
      LEFT JOIN at_tables.at_vehicle_universe_db v ON i.vehicle_id = v.vehicle_id
      WHERE i.full_investment_name IS NOT NULL
        AND i.fund_id = ${fundManagerId}
      ORDER BY vintage DESC NULLS LAST, i.full_investment_name
    `;
    log(`SUCCESS: Found ${result.length} investments for ${fundManagerId}`);
    result.forEach((inv: any, i: number) => {
      log(`  ${i + 1}. ${inv.investment_name} (Vehicle: ${inv.vehicle_id}, Vintage: ${inv.vintage})`);
    });
    return result;
  } catch (error) {
    log(`ERROR: ${error}`);
    return [];
  }
}

async function testPortfolioDates(vehicleId: string) {
  log(`\n=== TEST: Portfolio Dates for "${vehicleId}" ===`);
  try {
    const result = await sql`
      SELECT DISTINCT portfolio_date::text as date
      FROM tbv_db.fund_mv_db
      WHERE vehicle_id = ${vehicleId}
      ORDER BY date DESC
      LIMIT 5
    `;
    log(`SUCCESS: Found ${result.length} portfolio dates`);
    result.forEach((pd: any, i: number) => {
      log(`  ${i + 1}. ${pd.date}`);
    });
    return result;
  } catch (error) {
    log(`ERROR: ${error}`);
    return [];
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60));
  log('FILTER DATA STRUCTURE VALIDATION TEST');
  log('='.repeat(60));
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Test Vehicles: DRAGON-VEN-III, POLYCH-VEN-II, CRUCIB-VEN-I`);

  // Test 1: Fund Managers
  await testFundManagers();

  // Test 2: Investment Names for each test fund manager
  const testManagers = ['Dragonfly Capital', 'Polychain Capital', 'Crucible Capital'];
  for (const manager of testManagers) {
    const investments = await testInvestmentNames(manager);

    // Test 3: Portfolio Dates for first investment found
    if (investments.length > 0) {
      await testPortfolioDates(investments[0].vehicle_id);
    }
  }

  log('\n' + '='.repeat(60));
  log('TEST COMPLETE');
  log('='.repeat(60));

  // Close database connection
  await sql.end();
}

runAllTests().catch(console.error);
