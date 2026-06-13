import { DEMO_COMPANY } from '@demo-shared/company';

export const BRAND = {
  name: DEMO_COMPANY.name,
  tagline: DEMO_COMPANY.tagline,
  description: DEMO_COMPANY.description,
  poweredBy: DEMO_COMPANY.poweredBy,
  demoContext: DEMO_COMPANY.demoContext,
  sourceSystem: DEMO_COMPANY.sourceSystem,
} as const;
