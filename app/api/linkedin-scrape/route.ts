import { NextRequest, NextResponse } from 'next/server'
import { ApifyClient } from 'apify-client'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for scraping

function getPool() {
  const connStr = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '')
  return new Pool({
    connectionString: connStr,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000,
    ssl: { rejectUnauthorized: false }
  })
}

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const AIRTABLE_BASE_ID = process.env.AIRTABLE_MONITORING_BASE_ID
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_KEY_PEOPLE_TABLE_ID

// Find Airtable record by people_id
async function findAirtableRecord(peopleId: string): Promise<string | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    throw new Error('Airtable credentials not configured')
  }

  const formula = encodeURIComponent(`{people_id} = "${peopleId}"`)
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${formula}&maxRecords=1`

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[Airtable] Find record error:', error)
    throw new Error(`Airtable API error: ${response.status}`)
  }

  const data = await response.json()

  if (data.records && data.records.length > 0) {
    return data.records[0].id
  }

  return null
}

// Format experience/positions into readable text
function formatExperience(positions: any[]): string {
  if (!positions || positions.length === 0) return ''

  return positions.map((pos, index) => {
    const company = pos.companyName || pos.company?.name || 'Unknown Company'
    const title = pos.title || 'Unknown Role'
    const startDate = pos.startDate ? `${pos.startDate.month || ''}/${pos.startDate.year || ''}`.replace(/^\//, '') : ''
    const endDate = pos.endDate ? `${pos.endDate.month || ''}/${pos.endDate.year || ''}`.replace(/^\//, '') : 'Present'
    const duration = startDate ? `${startDate} - ${endDate}` : ''
    const description = pos.description || ''

    let entry = `${index + 1}. ${title} at ${company}`
    if (duration) entry += `\n   ${duration}`
    if (description) entry += `\n   ${description}`

    return entry
  }).join('\n\n')
}

// Format education into readable text
function formatEducation(educations: any[]): string {
  if (!educations || educations.length === 0) return ''

  return educations.map((edu, index) => {
    const school = edu.schoolName || edu.school?.name || 'Unknown School'
    const degree = edu.degreeName || edu.degree || ''
    const field = edu.fieldOfStudy || ''
    const startYear = edu.startDate?.year || ''
    const endYear = edu.endDate?.year || ''
    const duration = startYear || endYear ? `${startYear} - ${endYear}` : ''

    let entry = `${index + 1}. ${school}`
    if (degree || field) entry += `\n   ${[degree, field].filter(Boolean).join(' - ')}`
    if (duration) entry += `\n   ${duration}`

    return entry
  }).join('\n\n')
}

// Format skills into readable text
function formatSkills(skills: any[]): string {
  if (!skills || skills.length === 0) return ''

  // Skills can be strings or objects with a 'name' property
  return skills.map(skill => {
    if (typeof skill === 'string') return skill
    return skill.name || skill.skill || ''
  }).filter(Boolean).join(', ')
}

// Flatten nested positions structure from LinkedIn
// LinkedIn groups multiple roles at the same company into a nested structure:
// { company: {...}, positions: [{ title: "CFO", ...}, { title: "Director", ...}] }
// This function flattens it to: [{ title: "CFO", company: {...}, ...}, { title: "Director", company: {...}, ...}]
function flattenPositions(positions: any[]): any[] {
  if (!positions || !Array.isArray(positions)) {
    console.log('[Flatten] Invalid positions input:', typeof positions)
    return []
  }

  const flattened: any[] = []

  for (const pos of positions) {
    // Check if this position has nested positions (grouped roles at same company)
    if (pos.positions && Array.isArray(pos.positions) && pos.positions.length > 0) {
      const companyName = pos.company?.name || 'Unknown'
      console.log(`[Flatten] Found grouped position at ${companyName} with ${pos.positions.length} nested roles`)
      // Flatten nested positions, preserving company info from parent
      for (const nestedPos of pos.positions) {
        flattened.push({
          ...nestedPos,
          company: nestedPos.company || pos.company,
          companyName: nestedPos.companyName || pos.company?.name,
          locationName: nestedPos.locationName || pos.locationName,
        })
      }
    } else if (pos.title) {
      // This is a simple position with title directly on it
      console.log(`[Flatten] Found simple position: ${pos.title} at ${pos.company?.name || 'Unknown'}`)
      flattened.push(pos)
    } else {
      // Position has neither nested positions nor a title - might be malformed
      console.log('[Flatten] Skipping position with no nested positions and no title:', JSON.stringify(pos).substring(0, 200))
    }
  }

  console.log(`[Flatten] Flattened ${positions.length} positions to ${flattened.length} entries`)
  return flattened
}

// Extract tenure info from experience data by matching fund name
function extractTenureFromExperience(
  positions: any[],
  fundId: string
): { joiningYear: number | null; leavingYear: number | null; hasLeft: boolean; currentRole: string | null } {
  if (!positions || !Array.isArray(positions) || !fundId) {
    return { joiningYear: null, leavingYear: null, hasLeft: false, currentRole: null }
  }

  // Flatten nested positions first
  const flatPositions = flattenPositions(positions)

  // Normalize fund name for matching (remove common suffixes, lowercase)
  const normalizeName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/\s*(capital|partners|ventures|management|fund|crypto|vc|llc|inc|ltd)\.?\s*/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim()
  }

  const normalizedFundId = normalizeName(fundId)
  console.log(`[Tenure] Looking for fund "${fundId}" (normalized: "${normalizedFundId}")`)

  // Find position(s) at the fund
  const fundPositions = flatPositions.filter(pos => {
    const companyName = pos.company?.name || pos.companyName || ''
    const normalizedCompany = normalizeName(companyName)

    // Check if company name matches fund (fuzzy match)
    const matches = normalizedCompany.includes(normalizedFundId) ||
           normalizedFundId.includes(normalizedCompany) ||
           normalizedCompany === normalizedFundId

    if (matches) {
      console.log(`[Tenure] Matched position: "${pos.title}" at "${companyName}" (normalized: "${normalizedCompany}")`)
    }

    return matches
  })

  if (fundPositions.length === 0) {
    console.log(`[Tenure] No matching position found for fund: ${fundId}`)
    // Log all company names for debugging
    const allCompanies = flatPositions.map(p => p.company?.name || p.companyName || 'Unknown').join(', ')
    console.log(`[Tenure] Available companies in profile: ${allCompanies}`)
    return { joiningYear: null, leavingYear: null, hasLeft: false, currentRole: null }
  }

  console.log(`[Tenure] Found ${fundPositions.length} positions at ${fundId}`)

  // Find the earliest start date (when they joined the fund)
  const sortedByStart = [...fundPositions].sort((a, b) => {
    const yearA = a.timePeriod?.startDate?.year || 9999
    const monthA = a.timePeriod?.startDate?.month || 12
    const yearB = b.timePeriod?.startDate?.year || 9999
    const monthB = b.timePeriod?.startDate?.month || 12
    return (yearA * 12 + monthA) - (yearB * 12 + monthB)
  })
  const joiningYear = sortedByStart[0]?.timePeriod?.startDate?.year || null

  // Check if ANY position at the fund has no end date (meaning they're still there)
  // endDate can be null, undefined, or an object without a year
  const currentPosition = fundPositions.find(pos => {
    const endDate = pos.timePeriod?.endDate
    return !endDate || endDate.year == null
  })

  let hasLeft: boolean
  let leavingYear: number | null
  let currentRole: string | null

  if (currentPosition) {
    // They're still at the fund - use their current position
    hasLeft = false
    leavingYear = null
    currentRole = currentPosition.title || null
  } else {
    // All positions at this fund have end dates - they've left
    // Find the position with the LATEST end date to determine when they left
    const sortedByEnd = [...fundPositions].sort((a, b) => {
      const yearA = a.timePeriod?.endDate?.year || 0
      const monthA = a.timePeriod?.endDate?.month || 1
      const yearB = b.timePeriod?.endDate?.year || 0
      const monthB = b.timePeriod?.endDate?.month || 1
      return (yearB * 12 + monthB) - (yearA * 12 + monthA) // descending
    })
    const lastPosition = sortedByEnd[0]
    hasLeft = true
    leavingYear = lastPosition?.timePeriod?.endDate?.year || null
    currentRole = lastPosition?.title || null // Their last role at the fund
  }

  console.log(`[Tenure] Found for ${fundId}: joined=${joiningYear}, left=${leavingYear}, hasLeft=${hasLeft}, role=${currentRole}`)

  return {
    joiningYear,
    leavingYear,
    hasLeft,
    currentRole
  }
}

// Update Airtable record with LinkedIn data
async function updateAirtableRecord(recordId: string, updateData: Record<string, any>): Promise<boolean> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    throw new Error('Airtable credentials not configured')
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: updateData,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[Airtable] Update record error:', error)
    throw new Error(`Airtable API error: ${response.status}`)
  }

  return true
}

// POST: Scrape LinkedIn profiles and store in Airtable + Database
export async function POST(request: NextRequest) {
  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json({ error: 'Apify API token not configured' }, { status: 500 })
  }

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    return NextResponse.json({ error: 'Airtable credentials not configured' }, { status: 500 })
  }

  let pool: Pool | null = null

  try {
    pool = getPool()
    const dbClient = await pool.connect()
    const body = await request.json()
    const { linkedinUrls, peopleIds, force } = body

    if (!linkedinUrls || !Array.isArray(linkedinUrls) || linkedinUrls.length === 0) {
      return NextResponse.json({ error: 'No LinkedIn URLs provided' }, { status: 400 })
    }

    const urlsToScrape: string[] = []
    const peopleIdsToScrape: string[] = []
    const skipped: string[] = []

    // Check which profiles have already been scraped in Airtable (skip check if force=true)
    for (let i = 0; i < linkedinUrls.length; i++) {
      const url = linkedinUrls[i]
      const peopleId = peopleIds?.[i]

      let alreadyScraped = false
      if (!force && peopleId) {
        // Check Airtable for existing scraped data
        const formula = encodeURIComponent(`AND({people_id} = "${peopleId}", {linkedin_last_scraped} != "")`)
        const checkUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${formula}&maxRecords=1`

        const checkResponse = await fetch(checkUrl, {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        })

        if (checkResponse.ok) {
          const checkData = await checkResponse.json()
          alreadyScraped = checkData.records && checkData.records.length > 0
        }
      }

      if (alreadyScraped) {
        skipped.push(peopleId || url)
      } else {
        urlsToScrape.push(url)
        peopleIdsToScrape.push(peopleId)
      }
    }

    if (urlsToScrape.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All profiles already scraped',
        scraped: 0,
        skipped
      })
    }

    // Initialize Apify client
    const client = new ApifyClient({ token: apifyToken })

    console.log('[LinkedIn Scraper] Starting scrape for', urlsToScrape.length, 'profiles (skipped', skipped.length, 'already scraped)')
    console.log('[LinkedIn Scraper] URLs to scrape:', urlsToScrape)

    // Helper function to run a scrape for a batch of URLs
    const runScrape = async (urls: string[]): Promise<any[]> => {
      const scrapeInput = {
        urls: urls.map((url: string) => ({ url })),
        findContacts: false,
        scrapeCompany: false
      }

      console.log('[LinkedIn Scraper] Running batch of', urls.length, 'URLs')
      const run = await client.actor("yZnhB5JewWf9xSmoM").call(scrapeInput)
      console.log('[LinkedIn Scraper] Batch completed, run ID:', run.id, 'status:', run.status)

      if (run.status !== 'SUCCEEDED') {
        console.error('[LinkedIn Scraper] Batch failed with status:', run.status)
        return []
      }

      const { items } = await client.dataset(run.defaultDatasetId).listItems()
      return items as any[]
    }

    // Process in batches of 10
    const BATCH_SIZE = 10
    const items: any[] = []

    for (let i = 0; i < urlsToScrape.length; i += BATCH_SIZE) {
      const batchUrls = urlsToScrape.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(urlsToScrape.length / BATCH_SIZE)

      console.log(`[LinkedIn Scraper] Processing batch ${batchNum}/${totalBatches}:`, batchUrls)

      try {
        const batchItems = await runScrape(batchUrls)
        console.log(`[LinkedIn Scraper] Batch ${batchNum} returned ${batchItems.length} profiles`)
        items.push(...batchItems)
      } catch (batchError) {
        console.error(`[LinkedIn Scraper] Batch ${batchNum} error:`, batchError)
        // Continue with next batch
      }

      // Longer delay between batches - LinkedIn rate limits aggressively
      if (i + BATCH_SIZE < urlsToScrape.length) {
        console.log('[LinkedIn Scraper] Waiting 5 seconds before next batch...')
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    console.log('[LinkedIn Scraper] All batches complete. Total items:', items.length, 'of', urlsToScrape.length, 'requested')

    // Log sample response structure
    if (items.length > 0) {
      const sample = items[0] as any
      console.log('[LinkedIn Scraper] Sample response keys:', Object.keys(sample))
      console.log('[LinkedIn Scraper] Sample profile identifiers:', {
        url: sample.url,
        linkedInUrl: sample.linkedInUrl,
        publicIdentifier: sample.publicIdentifier,
      })
    }

    const results = []

    // Helper function to extract username from LinkedIn URL
    const extractUsername = (url: string): string => {
      if (!url) return ''
      // Match /in/username or /in/username/
      const match = url.match(/\/in\/([^\/\?]+)/i)
      return match ? match[1].toLowerCase() : ''
    }

    // Create maps for matching by different identifiers
    const profilesByUrl = new Map<string, any>()
    const profilesByUsername = new Map<string, any>()

    for (const item of items) {
      const profile = item as any

      // Try different possible URL fields from the Apify response
      const profileUrl = profile.url || profile.linkedInUrl || profile.linkedinUrl ||
                        profile.profileUrl || profile.inputUrl || ''

      // Get username from publicIdentifier or extract from URL
      const username = (profile.publicIdentifier || profile.username || extractUsername(profileUrl) || '').toLowerCase()

      if (profileUrl) {
        const normalizedUrl = profileUrl.toLowerCase().replace(/\/$/, '')
        profilesByUrl.set(normalizedUrl, profile)
      }

      if (username) {
        profilesByUsername.set(username, profile)
        console.log('[LinkedIn Scraper] Indexed profile by username:', username, '- Name:', profile.firstName, profile.lastName)
      }
    }

    console.log('[LinkedIn Scraper] Mapped', profilesByUrl.size, 'profiles by URL,', profilesByUsername.size, 'by username')

    for (let i = 0; i < urlsToScrape.length; i++) {
      const linkedinUrl = urlsToScrape[i]
      const peopleId = peopleIdsToScrape[i]

      // Extract username from input URL
      const inputUsername = extractUsername(linkedinUrl)
      console.log('[LinkedIn Scraper] Looking for profile:', peopleId, '- URL:', linkedinUrl, '- Username:', inputUsername)

      // Try matching by full URL first
      const normalizedInputUrl = linkedinUrl.toLowerCase().replace(/\/$/, '')
      let profile = profilesByUrl.get(normalizedInputUrl)
      let matchMethod = 'url'

      // Try matching by username
      if (!profile && inputUsername) {
        profile = profilesByUsername.get(inputUsername)
        matchMethod = 'username'
      }

      // Try partial URL matching
      if (!profile) {
        for (const [url, p] of profilesByUrl.entries()) {
          const urlUsername = extractUsername(url)
          if (urlUsername && urlUsername === inputUsername) {
            profile = p
            matchMethod = 'partial-url'
            break
          }
        }
      }

      // Fallback to index-based matching if URL matching fails
      if (!profile && i < items.length) {
        profile = items[i] as any
        matchMethod = 'index-fallback'
        console.log('[LinkedIn Scraper] Warning: Using index-based matching for', linkedinUrl)
      }

      if (!profile) {
        console.log('[LinkedIn Scraper] No profile found for:', linkedinUrl, '- skipping')
        continue
      }

      console.log('[LinkedIn Scraper] Matched profile for:', peopleId, '- found:', profile.firstName, profile.lastName, '- method:', matchMethod)

      // Get the fund_id for this person to extract tenure info
      let fundId: string | null = null
      let tenureInfo = { joiningYear: null as number | null, leavingYear: null as number | null, hasLeft: false, currentRole: null as string | null }

      try {
        const fundResult = await dbClient.query(
          'SELECT fund_id FROM at_tables.at_key_people_db WHERE people_id = $1 LIMIT 1',
          [peopleId]
        )
        if (fundResult.rows.length > 0) {
          fundId = fundResult.rows[0].fund_id
          console.log(`[LinkedIn Scraper] Found fund_id for ${peopleId}: "${fundId}"`)
          // Extract tenure info from experience
          if (fundId && profile.positions) {
            console.log(`[LinkedIn Scraper] Extracting tenure for ${peopleId} at ${fundId}, positions count: ${profile.positions?.length || 0}`)
            tenureInfo = extractTenureFromExperience(profile.positions, fundId)
            console.log(`[LinkedIn Scraper] Tenure result for ${peopleId}: joining=${tenureInfo.joiningYear}, leaving=${tenureInfo.leavingYear}, hasLeft=${tenureInfo.hasLeft}, role=${tenureInfo.currentRole}`)
          } else {
            console.log(`[LinkedIn Scraper] Skipping tenure extraction: fundId=${fundId}, hasPositions=${!!profile.positions}`)
          }
        } else {
          console.log(`[LinkedIn Scraper] No fund_id found in database for people_id: ${peopleId}`)
        }
      } catch (e) {
        console.error('[LinkedIn Scraper] Error getting fund_id:', e)
      }

      // Extract data from scraped profile - store full JSON for complete data
      const updateData: Record<string, any> = {
        linkedin_headline: profile.headline || null,
        linkedin_summary: profile.summary || null,
        linkedin_location: profile.geoLocationName || null,
        linkedin_profile_pic_url: profile.pictureUrl || null,
        linkedin_experience: profile.positions ? JSON.stringify(profile.positions, null, 2) : null,
        linkedin_education: profile.educations ? JSON.stringify(profile.educations, null, 2) : null,
        linkedin_skills: profile.skills ? JSON.stringify(profile.skills, null, 2) : null,
        linkedin_last_scraped: new Date().toISOString().split('T')[0] // Date format for Airtable
      }

      // Add tenure info if extracted
      if (tenureInfo.joiningYear) {
        updateData.joining_year = tenureInfo.joiningYear.toString()
        console.log(`[LinkedIn Scraper] Setting joining_year for ${peopleId}: ${tenureInfo.joiningYear}`)
      }
      if (tenureInfo.leavingYear) {
        updateData.leaving_year = tenureInfo.leavingYear.toString()
        console.log(`[LinkedIn Scraper] Setting leaving_year for ${peopleId}: ${tenureInfo.leavingYear}`)
      }
      if (tenureInfo.joiningYear || tenureInfo.leavingYear) {
        console.log(`[LinkedIn Scraper] Tenure update for ${peopleId}: joined=${updateData.joining_year || 'N/A'}, left=${updateData.leaving_year || 'N/A'}`)
      } else {
        console.log(`[LinkedIn Scraper] No tenure info extracted for ${peopleId}`)
      }

      // Update the Airtable record
      try {
        if (peopleId) {
          console.log('[LinkedIn Scraper] Finding Airtable record for people_id:', peopleId)
          const recordId = await findAirtableRecord(peopleId)

          if (recordId) {
            console.log('[LinkedIn Scraper] Updating Airtable record:', recordId)
            await updateAirtableRecord(recordId, updateData)
            console.log('[LinkedIn Scraper] Airtable updated for:', peopleId)
          } else {
            console.log('[LinkedIn Scraper] No Airtable record found for:', peopleId)
          }
        }
      } catch (airtableError) {
        console.error('[LinkedIn Scraper] Airtable update error for', peopleId || linkedinUrl, ':', airtableError)
        // Continue processing other profiles
      }

      // Also update the database (for dashboard to read from)
      try {
        if (peopleId) {
          console.log('[LinkedIn Scraper] Updating database for people_id:', peopleId, tenureInfo.hasLeft ? '(LEFT FUND)' : '')
          await dbClient.query(`
            UPDATE at_tables.at_key_people_db
            SET
              linkedin_headline = $1,
              linkedin_summary = $2,
              linkedin_location = $3,
              linkedin_profile_pic_url = $4,
              linkedin_experience = $5,
              linkedin_education = $6,
              linkedin_skills = $7,
              linkedin_last_scraped = $8,
              joining_year = COALESCE($9, joining_year),
              leaving_year = COALESCE($10, leaving_year)
            WHERE people_id = $11
          `, [
            updateData.linkedin_headline,
            updateData.linkedin_summary,
            updateData.linkedin_location,
            updateData.linkedin_profile_pic_url,
            updateData.linkedin_experience,
            updateData.linkedin_education,
            updateData.linkedin_skills,
            new Date().toISOString(),
            tenureInfo.joiningYear?.toString() || null,
            tenureInfo.leavingYear?.toString() || null,
            peopleId
          ])
          console.log('[LinkedIn Scraper] Database updated for:', peopleId)
        }
      } catch (dbError) {
        console.error('[LinkedIn Scraper] Database update error for', peopleId || linkedinUrl, ':', dbError)
        // Continue processing other profiles
      }

      // Extract company LinkedIn URL from current company or positions
      let companyLinkedinUrl = null
      let companyName = null

      if (profile.currentCompany?.url) {
        companyLinkedinUrl = profile.currentCompany.url
        companyName = profile.currentCompany.name
      } else if (profile.companyLinkedinUrl) {
        companyLinkedinUrl = profile.companyLinkedinUrl
        companyName = profile.companyName
      } else if (profile.positions && profile.positions.length > 0) {
        // Get company URL from first (current) position
        const firstPosition = profile.positions[0]
        if (firstPosition.company?.url) {
          companyLinkedinUrl = firstPosition.company.url
          companyName = firstPosition.company.name
        }
      }

      results.push({
        linkedinUrl,
        peopleId,
        name: profile.firstName && profile.lastName
          ? `${profile.firstName} ${profile.lastName}`
          : profile.name || 'Unknown',
        headline: updateData.linkedin_headline,
        jobTitle: profile.jobTitle,
        company: profile.companyName,
        companyLinkedinUrl,
        location: updateData.linkedin_location,
        joiningYear: tenureInfo.joiningYear,
        leavingYear: tenureInfo.leavingYear,
        hasLeftFund: tenureInfo.hasLeft,
        success: true
      })
    }

    console.log('[LinkedIn Scraper] Processing complete. Releasing DB client...')
    dbClient.release()

    console.log('[LinkedIn Scraper] Returning response with', results.length, 'results')
    return NextResponse.json({
      success: true,
      scraped: results.length,
      skipped: skipped.length,
      results
    })

  } catch (error) {
    console.error('[LinkedIn Scraper] Error:', error)
    return NextResponse.json(
      { error: 'Failed to scrape LinkedIn profiles', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  } finally {
    if (pool) await pool.end()
  }
}
