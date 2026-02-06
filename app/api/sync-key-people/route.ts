import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const AIRTABLE_BASE_ID = process.env.AIRTABLE_MONITORING_BASE_ID
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_KEY_PEOPLE_TABLE_ID

function getPool() {
  const connStr = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '')
  return new Pool({
    connectionString: connStr,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 120000,
    ssl: { rejectUnauthorized: false }
  })
}

// Only sync columns that exist in the database
const RELEVANT_COLUMNS = [
  'people_id',
  'fund_id',
  'role_str',
  'linkedin_profile_url',
  'text_chunks',
  'notes',
  'nationality',
  'twitter_handle',
  'joining_year',
  'leaving_year',
  'key_members',
  'hierarchy_level',
  'team',
  // LinkedIn scraped data columns
  'linkedin_headline',
  'linkedin_summary',
  'linkedin_location',
  'linkedin_profile_pic_url',
  'linkedin_experience',
  'linkedin_education',
  'linkedin_skills',
  'linkedin_last_scraped',
]

// Fetch all records from Airtable with pagination
async function fetchAllAirtableRecords(): Promise<any[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    throw new Error('Airtable credentials not configured')
  }

  const allRecords: any[] = []
  let offset: string | undefined = undefined

  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`)
    url.searchParams.set('pageSize', '100')
    if (offset) {
      url.searchParams.set('offset', offset)
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Airtable Sync] Fetch error:', error)
      throw new Error(`Airtable API error: ${response.status}`)
    }

    const data = await response.json()
    allRecords.push(...data.records)
    offset = data.offset
  } while (offset)

  return allRecords
}

// POST: Sync key people from Airtable to Database (only relevant columns)
export async function POST(request: NextRequest) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 })
  }

  let pool: Pool | null = null

  try {
    console.log('[Airtable Sync] Starting sync of key people...')

    // Fetch all records from Airtable
    const airtableRecords = await fetchAllAirtableRecords()
    console.log(`[Airtable Sync] Fetched ${airtableRecords.length} records from Airtable`)

    pool = getPool()
    const dbClient = await pool.connect()

    let synced = 0
    let errors = 0

    for (const record of airtableRecords) {
      const fields = record.fields || {}
      const peopleId = fields.people_id

      if (!peopleId) {
        console.log('[Airtable Sync] Skipping record without people_id')
        continue
      }

      try {
        // Upsert into database - only the columns that exist
        await dbClient.query(`
          INSERT INTO at_tables.at_key_people_db (
            people_id,
            fund_id,
            role_str,
            linkedin_profile_url,
            text_chunks,
            notes,
            nationality,
            twitter_handle,
            joining_year,
            leaving_year,
            key_members,
            hierarchy_level,
            team,
            linkedin_headline,
            linkedin_summary,
            linkedin_location,
            linkedin_profile_pic_url,
            linkedin_experience,
            linkedin_education,
            linkedin_skills,
            linkedin_last_scraped
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          ON CONFLICT (people_id) DO UPDATE SET
            fund_id = EXCLUDED.fund_id,
            role_str = EXCLUDED.role_str,
            linkedin_profile_url = EXCLUDED.linkedin_profile_url,
            text_chunks = EXCLUDED.text_chunks,
            notes = EXCLUDED.notes,
            nationality = EXCLUDED.nationality,
            twitter_handle = EXCLUDED.twitter_handle,
            joining_year = EXCLUDED.joining_year,
            leaving_year = EXCLUDED.leaving_year,
            key_members = EXCLUDED.key_members,
            hierarchy_level = EXCLUDED.hierarchy_level,
            team = EXCLUDED.team,
            linkedin_headline = COALESCE(EXCLUDED.linkedin_headline, at_tables.at_key_people_db.linkedin_headline),
            linkedin_summary = COALESCE(EXCLUDED.linkedin_summary, at_tables.at_key_people_db.linkedin_summary),
            linkedin_location = COALESCE(EXCLUDED.linkedin_location, at_tables.at_key_people_db.linkedin_location),
            linkedin_profile_pic_url = COALESCE(EXCLUDED.linkedin_profile_pic_url, at_tables.at_key_people_db.linkedin_profile_pic_url),
            linkedin_experience = COALESCE(EXCLUDED.linkedin_experience, at_tables.at_key_people_db.linkedin_experience),
            linkedin_education = COALESCE(EXCLUDED.linkedin_education, at_tables.at_key_people_db.linkedin_education),
            linkedin_skills = COALESCE(EXCLUDED.linkedin_skills, at_tables.at_key_people_db.linkedin_skills),
            linkedin_last_scraped = COALESCE(EXCLUDED.linkedin_last_scraped, at_tables.at_key_people_db.linkedin_last_scraped)
        `, [
          peopleId,
          fields.fund_id || null,
          fields.role_str || fields.role || null,
          fields.linkedin_profile_url || null,
          fields.text_chunks || null,
          fields.notes || null,
          fields.nationality || null,
          fields.twitter_handle || null,
          fields.joining_year || null,
          fields.leaving_year || null,
          fields.key_members || null,
          fields.hierarchy_level || null,
          fields.team || null,
          fields.linkedin_headline || null,
          fields.linkedin_summary || null,
          fields.linkedin_location || null,
          fields.linkedin_profile_pic_url || null,
          fields.linkedin_experience || null,
          fields.linkedin_education || null,
          fields.linkedin_skills || null,
          fields.linkedin_last_scraped || null,
        ])

        synced++
      } catch (dbError) {
        console.error(`[Airtable Sync] Error syncing ${peopleId}:`, dbError)
        errors++
      }
    }

    dbClient.release()

    console.log(`[Airtable Sync] Completed. Synced: ${synced}, Errors: ${errors}`)

    return NextResponse.json({
      success: true,
      synced,
      errors,
      total: airtableRecords.length,
      message: `Synced ${synced} key people from Airtable to database`
    })

  } catch (error) {
    console.error('[Airtable Sync] Error:', error)
    return NextResponse.json(
      { error: 'Failed to sync key people', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  } finally {
    if (pool) await pool.end()
  }
}

// GET: Return list of relevant columns being synced
export async function GET() {
  return NextResponse.json({
    relevantColumns: RELEVANT_COLUMNS,
    description: 'Only these columns are synced from Airtable to the database for the dashboard'
  })
}
