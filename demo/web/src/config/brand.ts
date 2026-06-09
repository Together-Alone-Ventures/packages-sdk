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
  tagline: 'Erase attendee data. Record a signed declaration on-chain.',
  description:
    'Conference ops demo (OffSign): after Infoshare you DELETE badge and lead data in Web2, your API signs a structured attestation, then MKTd03 records a tombstone receipt auditors can verify — they still trust your backend for the database state.',
  poweredBy: 'OffSign SDK · MKTd03 · Internet Computer',
  demoContext: 'Privacy booth scenario · Infoshare 2026',
} as const;
