/**
 * Curated reference knowledge for Air Guardian (Day 2: no vector store).
 *
 * Every item names its source. URLs are included only where they were
 * checked to resolve (2026-11-25); otherwise the document is cited by title.
 * To grow this into retrieval-augmented generation later, keep the same
 * KnowledgeItem shape and replace `searchKnowledge` with a vector search.
 */

export type KnowledgeItem = {
  id: string;
  title: string;
  source: { publisher: string; document: string; year: number; url: string | null };
  tags: string[];
  content: string;
};

export const KNOWLEDGE_BASE: readonly KnowledgeItem[] = [
  {
    id: "who-aqg-2021",
    title: "WHO global air quality guideline levels (2021)",
    source: {
      publisher: "World Health Organization",
      document: "WHO global air quality guidelines: particulate matter, ozone, nitrogen dioxide, sulfur dioxide and carbon monoxide",
      year: 2021,
      url: "https://www.who.int/publications/i/item/9789240034228",
    },
    tags: ["who", "guideline", "pm25", "pm10", "no2", "o3", "so2", "co", "limit", "safe level", "health"],
    content:
      "WHO 2021 air quality guideline levels: PM2.5 annual mean 5 µg/m³ and 24-hour mean 15 µg/m³; PM10 annual 15 µg/m³ and 24-hour 45 µg/m³; NO2 annual 10 µg/m³ and 24-hour 25 µg/m³; O3 8-hour 100 µg/m³ and peak season 60 µg/m³; SO2 24-hour 40 µg/m³; CO 24-hour 4 mg/m³. These are health-based guideline levels, not Indian legal limits.",
  },
  {
    id: "india-naaqs-2009",
    title: "India National Ambient Air Quality Standards (NAAQS, 2009)",
    source: {
      publisher: "Central Pollution Control Board, India",
      document: "National Ambient Air Quality Standards, notified 18 November 2009",
      year: 2009,
      url: null,
    },
    tags: ["naaqs", "india", "standard", "limit", "pm25", "pm10", "no2", "so2", "o3", "co", "nh3", "legal"],
    content:
      "India NAAQS (2009), residential/industrial areas: PM2.5 annual 40 µg/m³ and 24-hour 60 µg/m³; PM10 annual 60 µg/m³ and 24-hour 100 µg/m³; NO2 annual 40 µg/m³ and 24-hour 80 µg/m³; SO2 annual 50 µg/m³ and 24-hour 80 µg/m³; O3 8-hour 100 µg/m³ and 1-hour 180 µg/m³; CO 8-hour 2 mg/m³ and 1-hour 4 mg/m³; NH3 annual 100 µg/m³ and 24-hour 400 µg/m³.",
  },
  {
    id: "cpcb-naqi-categories",
    title: "CPCB National Air Quality Index categories and health impacts",
    source: {
      publisher: "Central Pollution Control Board, India",
      document: "National Air Quality Index (2014)",
      year: 2014,
      url: "https://app.cpcbccr.com/AQIIndia",
    },
    tags: ["cpcb", "aqi", "category", "good", "satisfactory", "moderate", "poor", "very poor", "severe", "health impact", "meaning"],
    content:
      "India National AQI categories: Good 0–50 (minimal impact); Satisfactory 51–100 (minor breathing discomfort to sensitive people); Moderate 101–200 (breathing discomfort to people with lung disease such as asthma, and heart disease); Poor 201–300 (breathing discomfort to most people on prolonged exposure); Very Poor 301–400 (respiratory illness on prolonged exposure); Severe 401–500 (affects healthy people and seriously impacts those with existing diseases).",
  },
  {
    id: "cpcb-naqi-method",
    title: "How the CPCB AQI is calculated",
    source: {
      publisher: "Central Pollution Control Board, India",
      document: "National Air Quality Index (2014)",
      year: 2014,
      url: null,
    },
    tags: ["cpcb", "aqi", "calculation", "method", "sub-index", "dominant", "24-hour", "8-hour", "how"],
    content:
      "The CPCB AQI uses up to eight pollutants. Each pollutant's concentration (24-hour average for PM10, PM2.5, NO2, SO2 and NH3; 8-hour for CO and O3) is converted to a sub-index on the 0–500 scale. The AQI is the highest sub-index, and that pollutant is the dominant pollutant. At least three pollutants are needed, one of which must be PM2.5 or PM10.",
  },
  {
    id: "who-health-effects",
    title: "Health effects of outdoor air pollution",
    source: {
      publisher: "World Health Organization",
      document: "Ambient (outdoor) air pollution fact sheet",
      year: 2024,
      url: "https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health",
    },
    tags: ["health", "effects", "pm25", "lungs", "heart", "children", "elderly", "sensitive", "why", "risk"],
    content:
      "Fine particles (PM2.5) can penetrate deep into the lungs and enter the bloodstream. Long-term exposure to outdoor air pollution is associated with heart disease, stroke, chronic respiratory disease and lung cancer. Children, older adults and people with existing heart or lung conditions are generally more vulnerable.",
  },
  {
    id: "hawa-data-method",
    title: "How Hawa AI sources and labels data",
    source: {
      publisher: "Hawa AI",
      document: "Hawa AI air-quality data methodology",
      year: 2026,
      url: null,
    },
    tags: ["hawa", "source", "openaq", "open-meteo", "measured", "modelled", "forecast", "station", "methodology", "data"],
    content:
      "Hawa AI's measured data are hourly averages from CPCB/RSPCB continuous monitoring stations in Jaipur, retrieved via OpenAQ. Hawa AI calculates the CPCB AQI from these measurements; it is not an official CPCB bulletin value. Modelled estimates and forecasts come from the Open-Meteo Air Quality API; for Jaipur they have read well below station measurements, so they indicate trends only, and no AQI is calculated from them. Some station values reported in ppb have unverified units and are not used.",
  },
];

const STOP_WORDS = new Set(["the", "a", "an", "is", "are", "of", "in", "for", "to", "and", "what", "how", "why", "does", "do", "it"]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/pm\s*2\.5/g, "pm25")
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Keyword search over the curated items. Returns at most `limit` items with a score above zero. */
export function searchKnowledge(query: string, limit = 3): KnowledgeItem[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];
  return KNOWLEDGE_BASE.map((item) => {
    const haystack = new Set([...item.tags.flatMap(tokens), ...tokens(item.title)]);
    const body = new Set(tokens(item.content));
    const score = queryTokens.reduce(
      (total, token) => total + (haystack.has(token) ? 3 : 0) + (body.has(token) ? 1 : 0),
      0,
    );
    return { item, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
