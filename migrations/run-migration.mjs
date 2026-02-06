import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection - uses environment variables
const sql = postgres({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060'),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: 'require',
});

async function runMigration() {
  console.log('Starting notes schema migration...\n');

  try {
    // Step 1: Create schema
    console.log('Step 1: Creating notes schema...');
    await sql`CREATE SCHEMA IF NOT EXISTS notes`;
    console.log('✓ Schema created\n');

    // Step 2: Create note_entities table
    console.log('Step 2: Creating note_entities table...');
    await sql`
      CREATE TABLE IF NOT EXISTS notes.note_entities (
        entity_id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_code VARCHAR(100) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        parent_entity_id INT REFERENCES notes.note_entities(entity_id),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(entity_type, entity_code)
      )
    `;
    console.log('✓ note_entities table created\n');

    // Step 3: Create notes_db table
    console.log('Step 3: Creating notes_db table...');
    await sql`
      CREATE TABLE IF NOT EXISTS notes.notes_db (
        note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(50) NOT NULL,
        entity_code VARCHAR(100),
        record_id_fund_manager VARCHAR(50),
        record_id_vehicle VARCHAR(50),
        record_id_project VARCHAR(50),
        tbv_fund VARCHAR(20),
        fund_manager_id VARCHAR(255),
        vehicle_id VARCHAR(255),
        project_id VARCHAR(255),
        row_identifier JSONB,
        date_of_review DATE NOT NULL,
        category VARCHAR(50) NOT NULL,
        note_text TEXT NOT NULL,
        author VARCHAR(255) NOT NULL,
        date_created TIMESTAMP DEFAULT NOW(),
        date_modified TIMESTAMP DEFAULT NOW(),
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by VARCHAR(255),
        CONSTRAINT valid_category CHECK (category IN (
          'action_item', 'observation', 'conclusion', 'risk_flag', 'follow_up',
          'question', 'positive_signal', 'update', 'reference', 'internal'
        ))
      )
    `;
    console.log('✓ notes_db table created\n');

    // Step 4: Create indexes on notes_db
    console.log('Step 4: Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes.notes_db(entity_type, entity_code)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_record_project ON notes.notes_db(record_id_project)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_record_vehicle ON notes.notes_db(record_id_vehicle)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_record_manager ON notes.notes_db(record_id_fund_manager)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_date_review ON notes.notes_db(date_of_review)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_not_deleted ON notes.notes_db(is_deleted) WHERE is_deleted = FALSE`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_tbv_fund ON notes.notes_db(tbv_fund)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_vehicle_id ON notes.notes_db(vehicle_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes.notes_db(project_id)`;
    console.log('✓ Indexes created\n');

    // Step 5: Create note_versions table
    console.log('Step 5: Creating note_versions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS notes.note_versions (
        version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID NOT NULL REFERENCES notes.notes_db(note_id) ON DELETE CASCADE,
        version_number INT NOT NULL,
        category VARCHAR(50) NOT NULL,
        note_text TEXT NOT NULL,
        modified_by VARCHAR(255) NOT NULL,
        modified_at TIMESTAMP DEFAULT NOW(),
        change_reason VARCHAR(255),
        UNIQUE(note_id, version_number)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_versions_note ON notes.note_versions(note_id)`;
    console.log('✓ note_versions table created\n');

    // Step 6: Create record_id_mapping table
    console.log('Step 6: Creating record_id_mapping table...');
    await sql`
      CREATE TABLE IF NOT EXISTS notes.record_id_mapping (
        mapping_id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        record_id VARCHAR(50) NOT NULL,
        current_business_id VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        last_updated TIMESTAMP DEFAULT NOW(),
        UNIQUE(entity_type, record_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_mapping_business ON notes.record_id_mapping(entity_type, current_business_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_mapping_record_id ON notes.record_id_mapping(record_id)`;
    console.log('✓ record_id_mapping table created\n');

    // Step 7: Populate initial note_entities
    console.log('Step 7: Populating note_entities...');
    await sql`
      INSERT INTO notes.note_entities (entity_type, entity_code, display_name) VALUES
        ('page', 'fund_monitoring', 'Fund Monitoring'),
        ('page', 'homepage', 'Homepage'),
        ('page', 'idd', 'Investment Due Diligence'),
        ('page', 'odd', 'Operational Due Diligence'),
        ('section', 'general', 'General'),
        ('section', 'overview', 'Overview'),
        ('section', 'historical_changes', 'Historical Changes'),
        ('fund_manager', '_dynamic', 'Fund Manager (Dynamic)'),
        ('vehicle', '_dynamic', 'Vehicle (Dynamic)'),
        ('project', '_dynamic', 'Project (Dynamic)'),
        ('tbv_fund', '_dynamic', 'TBV Fund (Dynamic)'),
        ('row', '_dynamic', 'Row (Dynamic)')
      ON CONFLICT (entity_type, entity_code) DO NOTHING
    `;
    console.log('✓ note_entities populated\n');

    // Step 8: Create helper functions
    console.log('Step 8: Creating helper functions...');
    await sql`
      CREATE OR REPLACE FUNCTION notes.get_record_id_for_project(p_project_id VARCHAR)
      RETURNS VARCHAR AS $$
      BEGIN
        RETURN (
          SELECT record_id
          FROM notes.record_id_mapping
          WHERE entity_type = 'project'
            AND current_business_id = p_project_id
          LIMIT 1
        );
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`
      CREATE OR REPLACE FUNCTION notes.get_record_id_for_vehicle(p_vehicle_id VARCHAR)
      RETURNS VARCHAR AS $$
      BEGIN
        RETURN (
          SELECT record_id
          FROM notes.record_id_mapping
          WHERE entity_type = 'vehicle'
            AND current_business_id = p_vehicle_id
          LIMIT 1
        );
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`
      CREATE OR REPLACE FUNCTION notes.refresh_record_id_mappings()
      RETURNS void AS $$
      BEGIN
        NULL;
      END;
      $$ LANGUAGE plpgsql
    `;
    console.log('✓ Helper functions created\n');

    console.log('========================================');
    console.log('Migration completed successfully!');
    console.log('========================================\n');

    // Verify tables
    console.log('Verifying created tables...');
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'notes'
      ORDER BY table_name
    `;
    console.log('Tables in notes schema:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
