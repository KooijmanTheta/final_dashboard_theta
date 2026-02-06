import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { ApifyClient } from 'apify-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function getPool() {
  // Strip sslmode from URL to avoid conflict with explicit ssl option
  const connStr = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '')
  return new Pool({
    connectionString: connStr,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
    ssl: { rejectUnauthorized: false }
  })
}

// GET: Fetch fund LinkedIn profile from database
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fundId = searchParams.get('fundId')

  if (!fundId) {
    return NextResponse.json({ error: 'fundId is required' }, { status: 400 })
  }

  let pool: Pool | null = null

  try {
    pool = getPool()
    const client = await pool.connect()

    const result = await client.query(`
      SELECT * FROM at_tables.fund_linkedin_profiles WHERE fund_id = $1
    `, [fundId])

    client.release()

    if (result.rows.length === 0) {
      return NextResponse.json({ fundId, profile: null })
    }

    const row = result.rows[0]
    return NextResponse.json({
      fundId,
      profile: {
        linkedinUrl: row.linkedin_url,
        companyName: row.company_name,
        description: row.description,
        industry: row.industry,
        companySize: row.company_size,
        employeeCount: row.employee_count,
        headquarters: row.headquarters,
        website: row.website,
        foundedYear: row.founded_year,
        specialties: row.specialties,
        logoUrl: row.logo_url,
        coverImageUrl: row.cover_image_url,
        followerCount: row.follower_count,
        lastScraped: row.last_scraped,
      }
    })
  } catch (error) {
    console.error('[Fund LinkedIn] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch fund profile', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  } finally {
    if (pool) await pool.end()
  }
}

// POST: Scrape fund LinkedIn profile and store in database
export async function POST(request: NextRequest) {
  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json({ error: 'Apify API token not configured' }, { status: 500 })
  }

  let pool: Pool | null = null

  try {
    const body = await request.json()
    const { fundId, linkedinUrl, force } = body

    if (!fundId || !linkedinUrl) {
      return NextResponse.json({ error: 'fundId and linkedinUrl are required' }, { status: 400 })
    }

    pool = getPool()
    const dbClient = await pool.connect()

    // Check if already scraped recently (within 7 days) - skip if force is true
    if (!force) {
      const existing = await dbClient.query(`
        SELECT last_scraped FROM at_tables.fund_linkedin_profiles
        WHERE fund_id = $1 AND last_scraped > NOW() - INTERVAL '7 days'
      `, [fundId])

      if (existing.rows.length > 0) {
        dbClient.release()
        return NextResponse.json({
          success: false,
          message: 'Fund profile was scraped recently',
          lastScraped: existing.rows[0].last_scraped
        })
      }
    }

    // Initialize Apify client
    const client = new ApifyClient({ token: apifyToken })

    // Prepare input for the company scraper
    const input = {
      companies: [linkedinUrl]
    }

    console.log('[Fund LinkedIn Scraper] Starting scrape for', fundId, linkedinUrl)

    // Run the Actor and wait for it to finish
    const run = await client.actor("UwSdACBp7ymaGUJjS").call(input)

    // Fetch results from the dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems()

    console.log('[Fund LinkedIn Scraper] Scraped', items.length, 'company profiles')

    if (items.length === 0) {
      dbClient.release()
      return NextResponse.json({ success: false, message: 'No data returned from scraper' })
    }

    const company = items[0] as any

    // Log the response structure
    console.log('[Fund LinkedIn Scraper] Company data:', JSON.stringify(company, null, 2))

    // Extract data from scraped company profile - using actual Apify response structure
    // Get headquarters from locations array
    let headquarters = null
    if (company.locations && company.locations.length > 0) {
      // Try parsed.text first, then fall back to other formats
      headquarters = company.locations[0]?.parsed?.text ||
                    company.locations[0]?.description ||
                    company.locations[0]?.city ||
                    null
    }

    // Get industry from industries array
    let industry = null
    if (company.industries && company.industries.length > 0) {
      industry = company.industries[0]?.name || company.industries[0] || null
    }

    // Get company size range
    let companySize = null
    if (company.employeeCountRange) {
      const start = company.employeeCountRange.start
      const end = company.employeeCountRange.end
      if (start && end) {
        companySize = `${start}-${end} employees`
      } else if (start) {
        companySize = `${start}+ employees`
      }
    }

    // Get founded year
    let foundedYear = null
    if (company.foundedOn?.year) {
      foundedYear = company.foundedOn.year
    } else if (typeof company.foundedOn === 'number') {
      foundedYear = company.foundedOn
    }

    // Get specialties - note the 'i' in specialities from Apify
    // Pass as native array for pg to handle PostgreSQL array conversion
    let specialties: string[] | null = null
    if (company.specialities && Array.isArray(company.specialities)) {
      specialties = company.specialities
    } else if (company.specialties && Array.isArray(company.specialties)) {
      specialties = company.specialties
    }

    const profileData = {
      linkedin_url: linkedinUrl,
      company_name: company.name || null,
      description: company.description || company.tagline || null,
      industry: industry,
      company_size: companySize,
      employee_count: company.employeeCount || null,
      headquarters: headquarters,
      website: company.website || null,
      founded_year: foundedYear,
      specialties: specialties,
      logo_url: company.logo || null,
      cover_image_url: company.backgroundCover || null,
      follower_count: company.followerCount || null,
      raw_data: JSON.stringify(company),
      last_scraped: new Date().toISOString()
    }

    // Upsert the fund profile
    await dbClient.query(`
      INSERT INTO at_tables.fund_linkedin_profiles (
        fund_id, linkedin_url, company_name, description, industry, company_size,
        employee_count, headquarters, website, founded_year, specialties,
        logo_url, cover_image_url, follower_count, raw_data, last_scraped, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (fund_id) DO UPDATE SET
        linkedin_url = EXCLUDED.linkedin_url,
        company_name = EXCLUDED.company_name,
        description = EXCLUDED.description,
        industry = EXCLUDED.industry,
        company_size = EXCLUDED.company_size,
        employee_count = EXCLUDED.employee_count,
        headquarters = EXCLUDED.headquarters,
        website = EXCLUDED.website,
        founded_year = EXCLUDED.founded_year,
        specialties = EXCLUDED.specialties,
        logo_url = EXCLUDED.logo_url,
        cover_image_url = EXCLUDED.cover_image_url,
        follower_count = EXCLUDED.follower_count,
        raw_data = EXCLUDED.raw_data,
        last_scraped = EXCLUDED.last_scraped,
        updated_at = NOW()
    `, [
      fundId,
      profileData.linkedin_url,
      profileData.company_name,
      profileData.description,
      profileData.industry,
      profileData.company_size,
      profileData.employee_count,
      profileData.headquarters,
      profileData.website,
      profileData.founded_year,
      profileData.specialties,
      profileData.logo_url,
      profileData.cover_image_url,
      profileData.follower_count,
      profileData.raw_data,
      profileData.last_scraped
    ])

    dbClient.release()

    return NextResponse.json({
      success: true,
      fundId,
      profile: {
        linkedinUrl: profileData.linkedin_url,
        companyName: profileData.company_name,
        description: profileData.description,
        industry: profileData.industry,
        companySize: profileData.company_size,
        employeeCount: profileData.employee_count,
        headquarters: profileData.headquarters,
        website: profileData.website,
        foundedYear: profileData.founded_year,
        specialties: profileData.specialties,
        logoUrl: profileData.logo_url,
        followerCount: profileData.follower_count,
        lastScraped: profileData.last_scraped,
      }
    })

  } catch (error) {
    console.error('[Fund LinkedIn Scraper] Error:', error)
    return NextResponse.json(
      { error: 'Failed to scrape fund profile', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  } finally {
    if (pool) await pool.end()
  }
}

// PUT: Update fund LinkedIn URL (manually set or from people scrape)
export async function PUT(request: NextRequest) {
  let pool: Pool | null = null

  try {
    const body = await request.json()
    const { fundId, linkedinUrl } = body

    if (!fundId || !linkedinUrl) {
      return NextResponse.json({ error: 'fundId and linkedinUrl are required' }, { status: 400 })
    }

    pool = getPool()
    const client = await pool.connect()

    // Upsert just the LinkedIn URL (without scraping)
    await client.query(`
      INSERT INTO at_tables.fund_linkedin_profiles (fund_id, linkedin_url, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (fund_id) DO UPDATE SET
        linkedin_url = EXCLUDED.linkedin_url,
        updated_at = NOW()
    `, [fundId, linkedinUrl])

    client.release()

    return NextResponse.json({ success: true, fundId, linkedinUrl })
  } catch (error) {
    console.error('[Fund LinkedIn] PUT error:', error)
    return NextResponse.json(
      { error: 'Failed to update fund LinkedIn URL', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  } finally {
    if (pool) await pool.end()
  }
}
