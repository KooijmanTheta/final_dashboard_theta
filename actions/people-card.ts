'use server';

import sql from '@/lib/db';

// ============================================
// TypeScript Interfaces
// ============================================

export interface PersonInfo {
  people_id: string;
  fund_id: string;
  role: string | null;
  team: string | null;
  hierarchy_level: number | null;
  key_member: boolean;
  joining_year: number | null;
  leaving_year: number | null;
  linkedin_profile_url: string | null;
  twitter_handle: string | null;
  linkedin_headline: string | null;
  linkedin_summary: string | null;
  linkedin_location: string | null;
  linkedin_profile_pic_url: string | null;
  notes: string | null;
  time_allocation: number | null;
  nationality: string | null;
}

export interface ExperienceEntry {
  company: {
    url?: string;
    logo?: string;
    name: string;
  };
  title?: string;
  positions?: Array<{
    title: string;
    insights?: string;
    timePeriod: {
      endDate?: { year: number; month?: number } | null;
      startDate?: { year: number; month?: number };
    };
    description?: string;
    locationName?: string;
    totalDuration?: string;
  }>;
  timePeriod?: {
    endDate?: { year: number; month?: number } | null;
    startDate?: { year: number; month?: number };
  };
  description?: string;
  locationName?: string;
  totalDuration?: string;
  employmentType?: string | null;
}

export interface EducationEntry {
  schoolUrl?: string;
  degreeName?: string;
  schoolLogo?: string;
  schoolName: string;
  timePeriod?: {
    startDate?: { year: number };
    endDate?: { year: number };
  };
  fieldOfStudy?: string;
}

export interface SkillEntry {
  name: string;
  experiences?: string;
  endorsements?: number;
}

// ============================================
// Person Info Query
// ============================================

/**
 * Get full person information by people_id
 */
export async function getPersonInfo(peopleId: string): Promise<PersonInfo | null> {
  try {
    const result = await sql<PersonInfo[]>`
      SELECT
        people_id,
        fund_id,
        role_str as role,
        team,
        hierarchy_level::int,
        CASE WHEN key_members IS NOT NULL AND key_members != '' THEN true ELSE false END as key_member,
        joining_year::int,
        leaving_year::int,
        linkedin_profile_url,
        twitter_handle,
        linkedin_headline,
        linkedin_summary,
        linkedin_location,
        linkedin_profile_pic_url,
        notes,
        NULL::float as time_allocation,
        nationality
      FROM at_tables.at_key_people_db
      WHERE people_id = ${peopleId}
      LIMIT 1
    `;

    if (result.length > 0) {
      console.log('Person info found:', peopleId);
      return result[0];
    }

    console.log('Person not found:', peopleId);
    return null;
  } catch (error) {
    console.error('Error fetching person info:', error);
    return null;
  }
}

// ============================================
// Experience & Education Queries
// ============================================

/**
 * Get parsed LinkedIn experience for a person
 */
export async function getPersonExperience(peopleId: string): Promise<ExperienceEntry[]> {
  try {
    const result = await sql<{ linkedin_experience: string | null }[]>`
      SELECT linkedin_experience
      FROM at_tables.at_key_people_db
      WHERE people_id = ${peopleId}
      LIMIT 1
    `;

    if (!result[0]?.linkedin_experience) {
      console.log('No experience data for:', peopleId);
      return [];
    }

    // Parse JSONB data
    const rawData = result[0].linkedin_experience;
    let experience: ExperienceEntry[];

    // Handle both string and object formats
    if (typeof rawData === 'string') {
      try {
        experience = JSON.parse(rawData);
      } catch (parseError) {
        console.error('Error parsing experience JSON:', parseError);
        return [];
      }
    } else {
      experience = rawData as unknown as ExperienceEntry[];
    }

    // Validate and return
    if (!Array.isArray(experience)) {
      console.error('Experience data is not an array:', peopleId);
      return [];
    }

    console.log('Experience entries for', peopleId, ':', experience.length);
    return experience;
  } catch (error) {
    console.error('Error fetching person experience:', error);
    return [];
  }
}

/**
 * Get parsed LinkedIn education for a person
 */
export async function getPersonEducation(peopleId: string): Promise<EducationEntry[]> {
  try {
    const result = await sql<{ linkedin_education: string | null }[]>`
      SELECT linkedin_education
      FROM at_tables.at_key_people_db
      WHERE people_id = ${peopleId}
      LIMIT 1
    `;

    if (!result[0]?.linkedin_education) {
      console.log('No education data for:', peopleId);
      return [];
    }

    // Parse JSONB data
    const rawData = result[0].linkedin_education;
    let education: EducationEntry[];

    // Handle both string and object formats
    if (typeof rawData === 'string') {
      try {
        education = JSON.parse(rawData);
      } catch (parseError) {
        console.error('Error parsing education JSON:', parseError);
        return [];
      }
    } else {
      education = rawData as unknown as EducationEntry[];
    }

    // Validate and return
    if (!Array.isArray(education)) {
      console.error('Education data is not an array:', peopleId);
      return [];
    }

    console.log('Education entries for', peopleId, ':', education.length);
    return education;
  } catch (error) {
    console.error('Error fetching person education:', error);
    return [];
  }
}

/**
 * Get parsed LinkedIn skills for a person
 */
export async function getPersonSkills(peopleId: string): Promise<SkillEntry[]> {
  try {
    const result = await sql<{ linkedin_skills: string | null }[]>`
      SELECT linkedin_skills
      FROM at_tables.at_key_people_db
      WHERE people_id = ${peopleId}
      LIMIT 1
    `;

    if (!result[0]?.linkedin_skills) {
      console.log('No skills data for:', peopleId);
      return [];
    }

    // Parse JSONB data
    const rawData = result[0].linkedin_skills;
    let skills: SkillEntry[];

    // Handle both string and object formats
    if (typeof rawData === 'string') {
      try {
        skills = JSON.parse(rawData);
      } catch (parseError) {
        console.error('Error parsing skills JSON:', parseError);
        return [];
      }
    } else {
      skills = rawData as unknown as SkillEntry[];
    }

    // Validate and return
    if (!Array.isArray(skills)) {
      console.error('Skills data is not an array:', peopleId);
      return [];
    }

    // Deduplicate by name (some data has duplicates)
    const uniqueSkills = skills.reduce((acc: SkillEntry[], skill) => {
      if (!acc.find(s => s.name === skill.name)) {
        acc.push(skill);
      }
      return acc;
    }, []);

    console.log('Skills for', peopleId, ':', uniqueSkills.length);
    return uniqueSkills;
  } catch (error) {
    console.error('Error fetching person skills:', error);
    return [];
  }
}

// ============================================
// Person Updates (from at_processed_notes)
// ============================================

export interface PersonUpdate {
  id: string;
  note_text: string;
  source_name: string | null;
  note_date: string;
  tags: string | null;
  summary: string | null;
}

/**
 * Get updates mentioning a person from at_processed_notes
 * Note: This queries the processed_notes table searching for the person's name
 */
export async function getPersonUpdates(peopleId: string): Promise<PersonUpdate[]> {
  try {
    // Search for person's name in processed notes
    // This is a basic implementation - may need refinement based on how person references work
    const result = await sql<PersonUpdate[]>`
      SELECT
        id::text,
        note_text,
        source_name,
        note_date::text,
        tags,
        claude_summary as summary
      FROM at_tables.at_processed_notes
      WHERE LOWER(note_text) LIKE LOWER(${'%' + peopleId + '%'})
         OR LOWER(claude_summary) LIKE LOWER(${'%' + peopleId + '%'})
      ORDER BY note_date DESC
      LIMIT 20
    `;

    console.log('Person updates for', peopleId, ':', result.length);
    return result;
  } catch (error) {
    console.error('Error fetching person updates:', error);
    return [];
  }
}
