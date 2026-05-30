/** Client app + Infoshare 2026 event skin for the Gdańsk booth demo. */
export const EVENT = {
  name: 'Infoshare',
  edition: '20th edition',
  tagline: 'Shape tomorrow today',
  dates: 'May 20-21, 2026',
  venue: 'AmberExpo, Gdańsk',
  city: 'Gdańsk',
  country: 'Poland',
  url: 'https://infoshare.pl/',
  theme: 'Biggest tech festival in CEE. Cybersecurity, AI, and privacy on stage.',
} as const;

export const BRAND = {
  name: 'TOGETHER ALONE VENTURES',
  tagline: 'Erase attendee data. Prove it on-chain.',
  description:
    'Conference ops demo: a visitor asks to be forgotten after Infoshare. You delete their badge, matchmaking, and expo lead data, then show a cryptographic receipt auditors can verify without trusting your database.',
  poweredBy: 'Zombie Delete · MKTd03 · Internet Computer',
  demoContext: 'Privacy booth scenario · Infoshare 2026',
} as const;
