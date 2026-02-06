import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getPool() {
  const connStr = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/g, '')
  return new Pool({
    connectionString: connStr,
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    ssl: { rejectUnauthorized: false }
  })
}

// Helper to safely parse JSON fields (handles both string and already-parsed data)
function safeJsonParse(value: any): any {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value // Already parsed (e.g., JSONB column)
}

// Flatten nested positions structure from LinkedIn
function flattenPositions(positions: any[]): any[] {
  if (!positions || !Array.isArray(positions)) return []

  const flattened: any[] = []

  for (const pos of positions) {
    if (pos.positions && Array.isArray(pos.positions) && pos.positions.length > 0) {
      for (const nestedPos of pos.positions) {
        flattened.push({
          ...nestedPos,
          company: nestedPos.company || pos.company,
          companyName: nestedPos.companyName || pos.company?.name,
        })
      }
    } else if (pos.title) {
      flattened.push(pos)
    }
  }

  return flattened
}

// Extract tenure info for a SPECIFIC fund from LinkedIn experience
function extractTenureForFund(
  positions: any[],
  fundName: string
): { joiningYear: number | null; leavingYear: number | null; hasLeft: boolean; currentRole: string | null } {
  if (!positions || !Array.isArray(positions) || !fundName) {
    return { joiningYear: null, leavingYear: null, hasLeft: false, currentRole: null }
  }

  const flatPositions = flattenPositions(positions)

  // Normalize fund name for matching
  const normalizeName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/\s*(capital|partners|ventures|management|fund|crypto|vc|llc|inc|ltd)\.?\s*/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim()
  }

  const normalizedFundName = normalizeName(fundName)

  // Find positions at this fund
  const fundPositions = flatPositions.filter(pos => {
    const companyName = pos.company?.name || pos.companyName || ''
    const normalizedCompany = normalizeName(companyName)
    return normalizedCompany.includes(normalizedFundName) ||
           normalizedFundName.includes(normalizedCompany) ||
           normalizedCompany === normalizedFundName
  })

  if (fundPositions.length === 0) {
    return { joiningYear: null, leavingYear: null, hasLeft: false, currentRole: null }
  }

  // Find earliest start date
  const sortedByStart = [...fundPositions].sort((a, b) => {
    const yearA = a.timePeriod?.startDate?.year || 9999
    const monthA = a.timePeriod?.startDate?.month || 12
    const yearB = b.timePeriod?.startDate?.year || 9999
    const monthB = b.timePeriod?.startDate?.month || 12
    return (yearA * 12 + monthA) - (yearB * 12 + monthB)
  })
  const joiningYear = sortedByStart[0]?.timePeriod?.startDate?.year || null

  // Check if ANY position at this fund has no end date
  const currentPosition = fundPositions.find(pos => {
    const endDate = pos.timePeriod?.endDate
    return !endDate || endDate.year == null
  })

  if (currentPosition) {
    return {
      joiningYear,
      leavingYear: null,
      hasLeft: false,
      currentRole: currentPosition.title || null
    }
  } else {
    // All positions have end dates - find latest end date
    const sortedByEnd = [...fundPositions].sort((a, b) => {
      const yearA = a.timePeriod?.endDate?.year || 0
      const monthA = a.timePeriod?.endDate?.month || 1
      const yearB = b.timePeriod?.endDate?.year || 0
      const monthB = b.timePeriod?.endDate?.month || 1
      return (yearB * 12 + monthB) - (yearA * 12 + monthA)
    })
    const lastPosition = sortedByEnd[0]
    return {
      joiningYear,
      leavingYear: lastPosition?.timePeriod?.endDate?.year || null,
      hasLeft: true,
      currentRole: lastPosition?.title || null
    }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fundId = searchParams.get('fundId')
  const search = searchParams.get('search')

  let pool: Pool | null = null

  try {
    pool = getPool()
    const client = await pool.connect()

    // Search people by name across all funds
    if (search) {
      const query = `
        SELECT
          people_id,
          fund_id,
          role_str,
          linkedin_profile_pic_url
        FROM at_tables.at_key_people_db
        WHERE people_id ILIKE $1
        ORDER BY people_id ASC
        LIMIT 20
      `
      const result = await client.query(query, [`%${search}%`])
      client.release()

      const results = result.rows.map((row: any) => ({
        name: row.people_id,
        fundId: row.fund_id,
        role: row.role_str,
        linkedinProfilePicUrl: row.linkedin_profile_pic_url
      }))

      return NextResponse.json({ results })
    }

    if (fundId) {
      // Fetch team members for a specific fund
      // Match people whose fund_id contains this fund (handles comma-separated values)
      const query = `
        SELECT
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
        FROM at_tables.at_key_people_db
        WHERE fund_id ILIKE $1
        ORDER BY
          COALESCE(hierarchy_level, 99) ASC,
          people_id ASC
      `
      const result = await client.query(query, [`%${fundId}%`])
      client.release()

      // Process members and compute fund-specific tenure from LinkedIn data
      const members = result.rows.map((row: any) => {
        const linkedinExperience = safeJsonParse(row.linkedin_experience)

        // Extract tenure specifically for THIS fund from LinkedIn experience
        const tenureInfo = linkedinExperience
          ? extractTenureForFund(linkedinExperience, fundId)
          : { joiningYear: null, leavingYear: null, hasLeft: false, currentRole: null }

        // Use LinkedIn-derived tenure if available, otherwise fall back to stored values
        const joiningYear = tenureInfo.joiningYear || row.joining_year
        const leavingYear = tenureInfo.leavingYear || row.leaving_year
        const hasLeft = tenureInfo.hasLeft || (row.leaving_year != null)

        return {
          name: row.people_id,
          fundId: row.fund_id,
          role: row.role_str,
          linkedinUrl: row.linkedin_profile_url,
          bio: row.text_chunks,
          notes: row.notes,
          nationality: row.nationality,
          twitter: row.twitter_handle,
          joiningYear: joiningYear?.toString() || null,
          leavingYear: leavingYear?.toString() || null,
          hasLeft,
          currentRoleAtFund: tenureInfo.currentRole,
          isKeyMember: row.key_members && row.key_members !== '',
          hierarchyLevel: row.hierarchy_level,
          team: row.team,
          linkedinHeadline: row.linkedin_headline,
          linkedinSummary: row.linkedin_summary,
          linkedinLocation: row.linkedin_location,
          linkedinProfilePicUrl: row.linkedin_profile_pic_url,
          linkedinExperience,
          linkedinEducation: safeJsonParse(row.linkedin_education),
          linkedinSkills: safeJsonParse(row.linkedin_skills),
          linkedinLastScraped: row.linkedin_last_scraped,
        }
      })

      return NextResponse.json({ fundId, members })
    } else {
      // Fetch all funds - split comma-separated fund_ids into separate funds
      const query = `
        SELECT
          people_id,
          fund_id,
          linkedin_profile_pic_url,
          hierarchy_level
        FROM at_tables.at_key_people_db
        WHERE fund_id IS NOT NULL AND fund_id != ''
      `
      const result = await client.query(query)
      client.release()

      // Process and split fund_ids, aggregating counts
      const fundMap = new Map<string, {
        memberCount: number
        scrapedCount: number
        previewPics: string[]
        topMembers: { name: string; level: number }[]
      }>()

      for (const row of result.rows) {
        // Split comma-separated fund_ids
        const funds = row.fund_id.split(',').map((f: string) => f.trim()).filter((f: string) => f)

        for (const fund of funds) {
          if (!fundMap.has(fund)) {
            fundMap.set(fund, {
              memberCount: 0,
              scrapedCount: 0,
              previewPics: [],
              topMembers: []
            })
          }

          const fundData = fundMap.get(fund)!
          fundData.memberCount++

          if (row.linkedin_profile_pic_url) {
            fundData.scrapedCount++
            if (fundData.previewPics.length < 4) {
              fundData.previewPics.push(row.linkedin_profile_pic_url)
            }
          }

          fundData.topMembers.push({
            name: row.people_id,
            level: row.hierarchy_level ?? 99
          })
        }
      }

      // Convert to array and sort
      const funds = Array.from(fundMap.entries())
        .map(([fundId, data]) => {
          // Sort top members by hierarchy and take top 3
          const sortedMembers = data.topMembers
            .sort((a, b) => a.level - b.level)
            .slice(0, 3)
            .map(m => m.name)

          return {
            fundId,
            memberCount: data.memberCount,
            scrapedCount: data.scrapedCount,
            previewPics: data.previewPics,
            topMembers: sortedMembers
          }
        })
        .sort((a, b) => a.fundId.localeCompare(b.fundId))

      return NextResponse.json({ funds })
    }
  } catch (error) {
    console.error('[v0] Key people fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch key people', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  } finally {
    if (pool) await pool.end()
  }
}

// PATCH: Update a team member's details (e.g., LinkedIn URL)
export async function PATCH(request: NextRequest) {
  let pool: Pool | null = null

  try {
    const body = await request.json()
    const { peopleId, linkedinUrl } = body

    if (!peopleId) {
      return NextResponse.json({ error: 'peopleId is required' }, { status: 400 })
    }

    pool = getPool()
    const client = await pool.connect()

    // Build update query dynamically based on provided fields
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (linkedinUrl !== undefined) {
      updates.push(`linkedin_profile_url = $${paramIndex}`)
      values.push(linkedinUrl || null)
      paramIndex++
    }

    if (updates.length === 0) {
      client.release()
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(peopleId)
    const query = `
      UPDATE at_tables.at_key_people_db
      SET ${updates.join(', ')}
      WHERE people_id = $${paramIndex}
      RETURNING people_id, linkedin_profile_url
    `

    const result = await client.query(query, values)
    client.release()

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    console.log(`[Key People] Updated LinkedIn URL for ${peopleId}: ${linkedinUrl}`)

    return NextResponse.json({
      success: true,
      peopleId: result.rows[0].people_id,
      linkedinUrl: result.rows[0].linkedin_profile_url
    })
  } catch (error) {
    console.error('[Key People] Update error:', error)
    return NextResponse.json(
      { error: 'Failed to update person', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  } finally {
    if (pool) await pool.end()
  }
}
