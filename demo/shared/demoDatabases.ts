/** Simulated rows/documents across MySQL, PostgreSQL, and MongoDB (demo UI). */

import type { DbEngine } from './dbEngine';
import { DEMO_COMPANY } from './company';
import { deletionHandleForRow } from './deletionSubject';

export type RecordErasureState = {
  ui: string;
  receipt?: unknown;
  lastError?: string;
  /** Cached row labels when the record is gone from the live DB snapshot. */
  display?: RecordDisplay;
};

export type RecordDisplay = {
  category: string;
  label: string;
  detail: string;
};

export type RecordsMap = Record<string, RecordErasureState | undefined>;

export type HomeDataItem = {
  /** Selection id — canonical deletion handle `{engine}/{table}/{keyField}/{value}`. */
  id: string;
  /** Same as id — kept for API/UI compatibility. */
  recordKey?: string;
  category: string;
  label: string;
  detail: string;
};

// —— MySQL (phpMyAdmin) ——

export type MysqlPiiRow = {
  recordKey?: string;
  id: number;
  category: string;
  full_name: string;
  email: string;
  company: string;
  pass_type: string;
  payload_summary: string;
  created_at: string;
};

export const MYSQL_TABLE = 'customer_pii';
export const MYSQL_SCHEMA = DEMO_COMPANY.mysqlSchema;

export const MYSQL_ROWS: MysqlPiiRow[] = [
  {
    recordKey: 'mysql:badge-48291-anna-kowalska',
    id: 48291,
    category: 'Customer',
    full_name: 'Anna Kowalska',
    email: 'anna.kowalska@example.com',
    company: 'Baltic FinTech Sp. z o.o.',
    pass_type: 'General Pass',
    payload_summary: 'badge_qr, dietary_veg, networking_opt_in',
    created_at: '2026-05-20 09:14:22',
  },
  {
    recordKey: 'mysql:match-7782-vc-roundtable',
    id: 7782,
    category: 'Networking',
    full_name: 'Marcus Nowak / VC Panel',
    email: 'marcus.nowak@roundtable.demo',
    company: 'Matchmaking slot #7782',
    pass_type: '1:1 meeting',
    payload_summary: 'calendar_hold, notes_encrypted, both_contacts',
    created_at: '2026-05-20 11:02:05',
  },
  {
    recordKey: 'mysql:expo-lead-innovation-village-12',
    id: 12004,
    category: 'Lead',
    full_name: 'Sofia Lindgren',
    email: 'sofia@startup-innovation.demo',
    company: 'Innovation Village booth #12',
    pass_type: 'Lead scan',
    payload_summary: 'pitch_deck_token, role=founder, gdpr_consent=true',
    created_at: '2026-05-20 15:38:41',
  },
  {
    recordKey: 'mysql:attendee-12018-piotr-winiewski',
    id: 12018,
    category: 'Customer',
    full_name: 'Piotr Wiśniewski',
    email: 'piotr.w@corp.demo',
    company: 'CloudScale PL',
    pass_type: 'VIP Pass',
    payload_summary: 'badge_qr, lounge_access, press_opt_out',
    created_at: '2026-05-20 08:55:10',
  },
  {
    recordKey: 'mysql:sponsor-9001-elena-varga',
    id: 9001,
    category: 'Partner',
    full_name: 'Elena Varga',
    email: 'elena.varga@sponsor-hub.demo',
    company: 'Amber Sponsor Lounge',
    pass_type: 'Staff',
    payload_summary: 'booth_wifi, lead_export_api_key_hash',
    created_at: '2026-05-19 16:20:00',
  },
  {
    recordKey: 'mysql:analytics-33-heatmap-batch',
    id: 33,
    category: 'Analytics',
    full_name: 'session_heatmap_batch',
    email: 'n/a',
    company: 'internal',
    pass_type: 'aggregate',
    payload_summary: 'hall_a footfall, no PII',
    created_at: '2026-05-20 18:00:00',
  },
  {
    recordKey: 'mysql:attendee-48302-lena-hoffmann',
    id: 48302,
    category: 'Customer',
    full_name: 'Lena Hoffmann',
    email: 'lena.hoffmann@saas.demo',
    company: 'Nordic SaaS Collective',
    pass_type: 'General Pass',
    payload_summary: 'badge_qr, newsletter_opt_in, hall_b',
    created_at: '2026-05-20 09:22:18',
  },
  {
    recordKey: 'mysql:attendee-48315-toms-rivera',
    id: 48315,
    category: 'Customer',
    full_name: 'Tomás Rivera',
    email: 'tomas.rivera@devops.demo',
    company: 'KubeShip',
    pass_type: 'Startup Pass',
    payload_summary: 'badge_qr, pitch_competition, dietary_none',
    created_at: '2026-05-20 09:31:44',
  },
  {
    recordKey: 'mysql:speaker-48344-amira-hassan',
    id: 48344,
    category: 'Speaker',
    full_name: 'Dr. Amira Hassan',
    email: 'amira.hassan@ailab.edu',
    company: 'Warsaw AI Institute',
    pass_type: 'Speaker',
    payload_summary: 'green_room, slides_uploaded, av_needs_hdmi',
    created_at: '2026-05-19 14:05:00',
  },
  {
    recordKey: 'mysql:media-48388-chris-o',
    id: 48388,
    category: 'Media',
    full_name: 'Chris O\'Brien',
    email: 'chris.obrien@techpress.demo',
    company: 'TechPress EU',
    pass_type: 'Press',
    payload_summary: 'press_kit_download, interview_slot_day1',
    created_at: '2026-05-20 07:48:12',
  },
  {
    recordKey: 'mysql:attendee-48401-yuki-tanaka',
    id: 48401,
    category: 'Customer',
    full_name: 'Yuki Tanaka',
    email: 'yuki.tanaka@mobility.demo',
    company: 'Mobility Labs JP',
    pass_type: 'General Pass',
    payload_summary: 'badge_qr, networking_opt_in, language=en',
    created_at: '2026-05-20 10:05:33',
  },
  {
    recordKey: 'mysql:workshop-48422-nina-bergstrm',
    id: 48422,
    category: 'Workshop',
    full_name: 'Nina Bergström',
    email: 'nina.bergstrom@design.demo',
    company: 'UX Baltic',
    pass_type: 'Workshop seat',
    payload_summary: 'session=design_systems_101, seat=A-14',
    created_at: '2026-05-20 10:18:09',
  },
  {
    recordKey: 'mysql:attendee-48455-oliver-grant',
    id: 48455,
    category: 'Customer',
    full_name: 'Oliver Grant',
    email: 'oliver.grant@vc.demo',
    company: 'Baltic Ventures',
    pass_type: 'Investor Pass',
    payload_summary: 'matchmaking_priority, lp_meeting_quota=8',
    created_at: '2026-05-20 11:44:02',
  },
  {
    recordKey: 'mysql:expo-48510-karolina-zieliska',
    id: 48510,
    category: 'Lead',
    full_name: 'Karolina Zielińska',
    email: 'karolina@cybersec-booth.demo',
    company: 'CyberSec Alley #7',
    pass_type: 'Booth staff',
    payload_summary: 'lead_scanner_id, demo_mode=active',
    created_at: '2026-05-20 12:30:00',
  },
  {
    recordKey: 'mysql:attendee-48567-david-kim',
    id: 48567,
    category: 'Customer',
    full_name: 'David Kim',
    email: 'david.kim@healthtech.demo',
    company: 'MedFlow',
    pass_type: 'General Pass',
    payload_summary: 'badge_qr, dietary_halal, accessibility_elevator',
    created_at: '2026-05-20 13:12:47',
  },
  {
    recordKey: 'mysql:volunteer-48602-maja-nowicka',
    id: 48602,
    category: 'Staff',
    full_name: 'Maja Nowicka',
    email: 'maja.nowicka@meridian-ops.demo',
    company: 'Meridian Ops',
    pass_type: 'Staff',
    payload_summary: 'zone=registration, shift=day1_am',
    created_at: '2026-05-19 18:00:00',
  },
  {
    recordKey: 'mysql:networking-48644-speed-dating-block-b',
    id: 48644,
    category: 'Networking',
    full_name: 'Speed dating block B',
    email: 'scheduling@meridian.internal',
    company: 'platform',
    pass_type: 'slot_batch',
    payload_summary: '12_pairings, mutual_opt_in_only',
    created_at: '2026-05-20 14:00:00',
  },
  {
    recordKey: 'mysql:sponsor-48701-henrik-larsson',
    id: 48701,
    category: 'Partner',
    full_name: 'Henrik Larsson',
    email: 'henrik@sponsor-cloud.demo',
    company: 'CloudPrime Pavilion',
    pass_type: 'Sponsor VIP',
    payload_summary: 'hospitality_suite, lead_api_enabled',
    created_at: '2026-05-19 11:30:00',
  },
  {
    recordKey: 'mysql:attendee-48788-zofia-kaczmarek',
    id: 48788,
    category: 'Customer',
    full_name: 'Zofia Kaczmarek',
    email: 'zofia.k@student.demo',
    company: 'Riverdale University',
    pass_type: 'Student Pass',
    payload_summary: 'badge_qr, student_id_verified, day_pass=2',
    created_at: '2026-05-20 15:02:19',
  },
  {
    recordKey: 'mysql:expo-48820-james-wright',
    id: 48820,
    category: 'Lead',
    full_name: 'James Wright',
    email: 'james@dronezone.demo',
    company: 'DroneZone booth #24',
    pass_type: 'Lead scan',
    payload_summary: 'product_demo_booked, phone_opt_in=false',
    created_at: '2026-05-20 15:55:33',
  },
  {
    recordKey: 'mysql:attendee-48899-isabelle-dubois',
    id: 48899,
    category: 'Customer',
    full_name: 'Isabelle Dubois',
    email: 'isabelle.dubois@fintech.demo',
    company: 'PayStream FR',
    pass_type: 'VIP Pass',
    payload_summary: 'badge_qr, lounge_access, interpreter=fr',
    created_at: '2026-05-20 16:20:08',
  },
];

// —— PostgreSQL ——

export type PostgresRow = {
  recordKey?: string;
  id: string;
  source: string;
  contact_name: string;
  contact_email: string;
  org: string;
  interaction_type: string;
  metadata: string;
  updated_at: string;
};

export const PG_DATABASE = DEMO_COMPANY.postgresDatabase;
export const PG_SCHEMA = 'public';
export const PG_TABLE = 'customer_contacts';

export const POSTGRES_ROWS: PostgresRow[] = [
  {
    recordKey: 'postgres:cnt_48291',
    id: 'cnt_48291',
    source: 'registration',
    contact_name: 'Anna Kowalska',
    contact_email: 'anna.kowalska@example.com',
    org: 'Baltic FinTech Sp. z o.o.',
    interaction_type: 'badge_issued',
    metadata: '{"dietary":"vegetarian","networking":true}',
    updated_at: '2026-05-20 09:14:22+02',
  },
  {
    recordKey: 'postgres:cnt_7782',
    id: 'cnt_7782',
    source: 'matchmaking',
    contact_name: 'Marcus Nowak',
    contact_email: 'marcus.nowak@roundtable.demo',
    org: 'VC Roundtable',
    interaction_type: '1:1_slot',
    metadata: '{"slot":"14:30","notes_ref":"enc:9f2a"}',
    updated_at: '2026-05-20 11:02:05+02',
  },
  {
    recordKey: 'postgres:cnt_12004',
    id: 'cnt_12004',
    source: 'expo_scan',
    contact_name: 'Sofia Lindgren',
    contact_email: 'sofia@startup-innovation.demo',
    org: 'Innovation Village #12',
    interaction_type: 'lead_capture',
    metadata: '{"deck_token":"tok_8k2m","role":"founder"}',
    updated_at: '2026-05-20 15:38:41+02',
  },
  {
    recordKey: 'postgres:cnt_12018',
    id: 'cnt_12018',
    source: 'registration',
    contact_name: 'Piotr Wiśniewski',
    contact_email: 'piotr.w@corp.demo',
    org: 'CloudScale PL',
    interaction_type: 'badge_issued',
    metadata: '{"vip":true,"lounge":"amber"}',
    updated_at: '2026-05-20 08:55:10+02',
  },
  {
    recordKey: 'postgres:cnt_4410',
    id: 'cnt_4410',
    source: 'workshop',
    contact_name: 'Jakub Marek',
    contact_email: 'jakub@ai-lab.demo',
    org: 'AI Stage',
    interaction_type: 'waitlist',
    metadata: '{"session":"keynote_day2","seat":null}',
    updated_at: '2026-05-20 10:12:00+02',
  },
  {
    recordKey: 'postgres:cnt_9001',
    id: 'cnt_9001',
    source: 'sponsor_portal',
    contact_name: 'Elena Varga',
    contact_email: 'elena.varga@sponsor-hub.demo',
    org: 'Amber Sponsor Lounge',
    interaction_type: 'staff_badge',
    metadata: '{"api_scope":"lead_export"}',
    updated_at: '2026-05-19 16:20:00+02',
  },
  {
    recordKey: 'postgres:cnt_sync_01',
    id: 'cnt_sync_01',
    source: 'crm_webhook',
    contact_name: 'HubSpot sync batch',
    contact_email: 'integration@meridian.internal',
    org: 'marketing',
    interaction_type: 'batch_sync',
    metadata: '{"records":142,"pii_fields":["email","phone"]}',
    updated_at: '2026-05-20 17:45:00+02',
  },
  {
    recordKey: 'postgres:cnt_48302',
    id: 'cnt_48302',
    source: 'registration',
    contact_name: 'Lena Hoffmann',
    contact_email: 'lena.hoffmann@saas.demo',
    org: 'Nordic SaaS Collective',
    interaction_type: 'badge_issued',
    metadata: '{"newsletter":true,"hall":"B"}',
    updated_at: '2026-05-20 09:22:18+02',
  },
  {
    recordKey: 'postgres:cnt_48344',
    id: 'cnt_48344',
    source: 'speaker_portal',
    contact_name: 'Dr. Amira Hassan',
    contact_email: 'amira.hassan@ailab.edu',
    org: 'Warsaw AI Institute',
    interaction_type: 'speaker_profile',
    metadata: '{"talk":"scaling_llm_infra","av":"hdmi"}',
    updated_at: '2026-05-19 14:05:00+02',
  },
  {
    recordKey: 'postgres:cnt_48388',
    id: 'cnt_48388',
    source: 'press_desk',
    contact_name: 'Chris O\'Brien',
    contact_email: 'chris.obrien@techpress.demo',
    org: 'TechPress EU',
    interaction_type: 'press_accreditation',
    metadata: '{"interview_slot":"day1_11:00"}',
    updated_at: '2026-05-20 07:48:12+02',
  },
  {
    recordKey: 'postgres:cnt_48422',
    id: 'cnt_48422',
    source: 'workshop',
    contact_name: 'Nina Bergström',
    contact_email: 'nina.bergstrom@design.demo',
    org: 'UX Baltic',
    interaction_type: 'seat_reserved',
    metadata: '{"session":"design_systems_101","seat":"A-14"}',
    updated_at: '2026-05-20 10:18:09+02',
  },
  {
    recordKey: 'postgres:cnt_48455',
    id: 'cnt_48455',
    source: 'matchmaking',
    contact_name: 'Oliver Grant',
    contact_email: 'oliver.grant@vc.demo',
    org: 'Baltic Ventures',
    interaction_type: 'investor_profile',
    metadata: '{"quota":8,"sectors":["fintech","saas"]}',
    updated_at: '2026-05-20 11:44:02+02',
  },
  {
    recordKey: 'postgres:cnt_48510',
    id: 'cnt_48510',
    source: 'expo_scan',
    contact_name: 'Karolina Zielińska',
    contact_email: 'karolina@cybersec-booth.demo',
    org: 'CyberSec Alley #7',
    interaction_type: 'booth_staff',
    metadata: '{"scanner":"active","zone":"cyber"}',
    updated_at: '2026-05-20 12:30:00+02',
  },
  {
    recordKey: 'postgres:cnt_48567',
    id: 'cnt_48567',
    source: 'registration',
    contact_name: 'David Kim',
    contact_email: 'david.kim@healthtech.demo',
    org: 'MedFlow',
    interaction_type: 'badge_issued',
    metadata: '{"dietary":"halal","a11y":"elevator"}',
    updated_at: '2026-05-20 13:12:47+02',
  },
  {
    recordKey: 'postgres:cnt_48602',
    id: 'cnt_48602',
    source: 'volunteer_hub',
    contact_name: 'Maja Nowicka',
    contact_email: 'maja.nowicka@meridian-ops.demo',
    org: 'Meridian Ops',
    interaction_type: 'shift_assigned',
    metadata: '{"zone":"registration","shift":"day1_am"}',
    updated_at: '2026-05-19 18:00:00+02',
  },
  {
    recordKey: 'postgres:cnt_48644',
    id: 'cnt_48644',
    source: 'matchmaking',
    contact_name: 'Speed dating block B',
    contact_email: 'scheduling@meridian.internal',
    org: 'platform',
    interaction_type: 'batch_pairing',
    metadata: '{"pairs":12,"mutual_only":true}',
    updated_at: '2026-05-20 14:00:00+02',
  },
  {
    recordKey: 'postgres:cnt_48701',
    id: 'cnt_48701',
    source: 'sponsor_portal',
    contact_name: 'Henrik Larsson',
    contact_email: 'henrik@sponsor-cloud.demo',
    org: 'CloudPrime Pavilion',
    interaction_type: 'sponsor_vip',
    metadata: '{"suite":true,"lead_api":true}',
    updated_at: '2026-05-19 11:30:00+02',
  },
  {
    recordKey: 'postgres:cnt_48788',
    id: 'cnt_48788',
    source: 'registration',
    contact_name: 'Zofia Kaczmarek',
    contact_email: 'zofia.k@student.demo',
    org: 'Riverdale University',
    interaction_type: 'student_pass',
    metadata: '{"verified":true,"days":2}',
    updated_at: '2026-05-20 15:02:19+02',
  },
  {
    recordKey: 'postgres:cnt_48820',
    id: 'cnt_48820',
    source: 'expo_scan',
    contact_name: 'James Wright',
    contact_email: 'james@dronezone.demo',
    org: 'DroneZone booth #24',
    interaction_type: 'demo_booking',
    metadata: '{"phone_opt_in":false}',
    updated_at: '2026-05-20 15:55:33+02',
  },
  {
    recordKey: 'postgres:cnt_48899',
    id: 'cnt_48899',
    source: 'registration',
    contact_name: 'Isabelle Dubois',
    contact_email: 'isabelle.dubois@fintech.demo',
    org: 'PayStream FR',
    interaction_type: 'badge_issued',
    metadata: '{"vip":true,"interpreter":"fr"}',
    updated_at: '2026-05-20 16:20:08+02',
  },
  {
    recordKey: 'postgres:cnt_48950',
    id: 'cnt_48950',
    source: 'mobile_app',
    contact_name: 'Tomás Rivera',
    contact_email: 'tomas.rivera@devops.demo',
    org: 'KubeShip',
    interaction_type: 'app_session',
    metadata: '{"device":"ios","push_enabled":true}',
    updated_at: '2026-05-20 09:31:44+02',
  },
  {
    recordKey: 'postgres:cnt_49001',
    id: 'cnt_49001',
    source: 'feedback',
    contact_name: 'Yuki Tanaka',
    contact_email: 'yuki.tanaka@mobility.demo',
    org: 'Mobility Labs JP',
    interaction_type: 'survey_completed',
    metadata: '{"rating":5,"session":"opening_keynote"}',
    updated_at: '2026-05-20 17:10:00+02',
  },
];

// —— MongoDB ——

export type MongoCollection = {
  name: string;
  documentCount: number;
};

export type MongoDocument = {
  recordKey?: string;
  _id: string;
  collection: string;
  doc: Record<string, unknown>;
};

export const MONGO_CLUSTER = DEMO_COMPANY.mongoCluster;
export const MONGO_DATABASE = DEMO_COMPANY.mongoDatabase;

export const MONGO_COLLECTIONS: MongoCollection[] = [
  { name: 'attendee_profiles', documentCount: 12 },
  { name: 'networking_sessions', documentCount: 7 },
  { name: 'expo_leads', documentCount: 8 },
  { name: 'workshop_rsvp', documentCount: 5 },
];

export const MONGO_DOCUMENTS: MongoDocument[] = [
  {
    recordKey: 'mongo:attendee-48291',
    _id: 'ObjectId("682b1a2e9f0a4c00148291")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 48291,
      name: 'Anna Kowalska',
      email: 'anna.kowalska@example.com',
      company: 'Baltic FinTech Sp. z o.o.',
      pass: 'General Pass',
      preferences: { dietary: 'vegetarian', networking: true },
      qrPayload: 'badge:48291:sha256:…',
    },
  },
  {
    recordKey: 'mongo:session-7782',
    _id: 'ObjectId("682b2f109f0a4c00107782")',
    collection: 'networking_sessions',
    doc: {
      sessionId: 7782,
      type: 'vc_roundtable',
      participants: ['marcus.nowak@roundtable.demo', 'anna.kowalska@example.com'],
      calendarHold: '2026-05-20T14:30:00+02:00',
      notesEncrypted: true,
    },
  },
  {
    recordKey: 'mongo:lead-12004',
    _id: 'ObjectId("682b4a219f0a4c00112004")',
    collection: 'expo_leads',
    doc: {
      leadId: 12004,
      booth: 'Innovation Village #12',
      contact: { name: 'Sofia Lindgren', email: 'sofia@startup-innovation.demo', role: 'founder' },
      pitchDeckToken: 'tok_8k2m',
      gdprConsent: true,
      scannedAt: '2026-05-20T15:38:41Z',
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-112018',
    _id: 'ObjectId("682b0c889f0a4c00112018")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 12018,
      name: 'Piotr Wiśniewski',
      email: 'piotr.w@corp.demo',
      company: 'CloudScale PL',
      pass: 'VIP Pass',
      loungeAccess: 'amber',
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-009001',
    _id: 'ObjectId("682a9e009f0a4c00009001")',
    collection: 'attendee_profiles',
    doc: {
      staffId: 9001,
      name: 'Elena Varga',
      email: 'elena.varga@sponsor-hub.demo',
      sponsorZone: 'Amber Sponsor Lounge',
      permissions: ['lead_export', 'wifi_staff'],
    },
  },
  {
    recordKey: 'mongo:networking-sessions-004410',
    _id: 'ObjectId("682b55109f0a4c00004410")',
    collection: 'networking_sessions',
    doc: {
      sessionId: 4410,
      type: 'workshop_waitlist',
      title: 'AI keynote day 2',
      attendee: 'jakub@ai-lab.demo',
      status: 'waiting',
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-148302',
    _id: 'ObjectId("682b1b009f0a4c00148302")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 48302,
      name: 'Lena Hoffmann',
      email: 'lena.hoffmann@saas.demo',
      company: 'Nordic SaaS Collective',
      pass: 'General Pass',
      preferences: { newsletter: true },
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-148344',
    _id: 'ObjectId("682b1c119f0a4c00148344")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 48344,
      name: 'Dr. Amira Hassan',
      email: 'amira.hassan@ailab.edu',
      company: 'Warsaw AI Institute',
      pass: 'Speaker',
      speakerSlot: 'day1_main_stage_14:00',
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-148455',
    _id: 'ObjectId("682b1d229f0a4c00148455")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 48455,
      name: 'Oliver Grant',
      email: 'oliver.grant@vc.demo',
      company: 'Baltic Ventures',
      pass: 'Investor Pass',
      matchmakingQuota: 8,
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-148567',
    _id: 'ObjectId("682b1e339f0a4c00148567")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 48567,
      name: 'David Kim',
      email: 'david.kim@healthtech.demo',
      company: 'MedFlow',
      pass: 'General Pass',
      preferences: { dietary: 'halal', accessibility: 'elevator' },
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-148788',
    _id: 'ObjectId("682b1f449f0a4c00148788")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 48788,
      name: 'Zofia Kaczmarek',
      email: 'zofia.k@student.demo',
      company: 'Riverdale University',
      pass: 'Student Pass',
      studentVerified: true,
    },
  },
  {
    recordKey: 'mongo:attendee-profiles-148899',
    _id: 'ObjectId("682b20449f0a4c00148899")',
    collection: 'attendee_profiles',
    doc: {
      badgeId: 48899,
      name: 'Isabelle Dubois',
      email: 'isabelle.dubois@fintech.demo',
      company: 'PayStream FR',
      pass: 'VIP Pass',
      loungeAccess: 'amber',
      interpreter: 'fr',
    },
  },
  {
    recordKey: 'mongo:networking-sessions-148644',
    _id: 'ObjectId("682b30109f0a4c00148644")',
    collection: 'networking_sessions',
    doc: {
      sessionId: 48644,
      type: 'speed_dating',
      block: 'B',
      pairings: 12,
      mutualOptInOnly: true,
    },
  },
  {
    recordKey: 'mongo:networking-sessions-148455',
    _id: 'ObjectId("682b31109f0a4c00148455")',
    collection: 'networking_sessions',
    doc: {
      sessionId: 48455,
      type: 'investor_office_hours',
      host: 'oliver.grant@vc.demo',
      slotsBooked: 6,
      slotsTotal: 8,
    },
  },
  {
    recordKey: 'mongo:networking-sessions-148302',
    _id: 'ObjectId("682b32109f0a4c00148302")',
    collection: 'networking_sessions',
    doc: {
      sessionId: 48302,
      type: 'coffee_chat',
      participants: ['lena.hoffmann@saas.demo', 'yuki.tanaka@mobility.demo'],
      table: 'Lounge-12',
    },
  },
  {
    recordKey: 'mongo:expo-leads-148510',
    _id: 'ObjectId("682b4b009f0a4c00148510")',
    collection: 'expo_leads',
    doc: {
      leadId: 48510,
      booth: 'CyberSec Alley #7',
      contact: { name: 'Karolina Zielińska', email: 'karolina@cybersec-booth.demo', role: 'sales' },
      scannerActive: true,
    },
  },
  {
    recordKey: 'mongo:expo-leads-148820',
    _id: 'ObjectId("682b4c119f0a4c00148820")',
    collection: 'expo_leads',
    doc: {
      leadId: 48820,
      booth: 'DroneZone #24',
      contact: { name: 'James Wright', email: 'james@dronezone.demo', role: 'bd' },
      demoBooked: true,
      phoneOptIn: false,
    },
  },
  {
    recordKey: 'mongo:expo-leads-148701',
    _id: 'ObjectId("682b4d229f0a4c00148701")',
    collection: 'expo_leads',
    doc: {
      leadId: 48701,
      booth: 'CloudPrime Pavilion',
      contact: { name: 'Henrik Larsson', email: 'henrik@sponsor-cloud.demo', role: 'sponsor' },
      hospitalitySuite: true,
    },
  },
  {
    recordKey: 'mongo:expo-leads-148315',
    _id: 'ObjectId("682b4e339f0a4c00148315")',
    collection: 'expo_leads',
    doc: {
      leadId: 48315,
      booth: 'Startup Alley #3',
      contact: { name: 'Tomás Rivera', email: 'tomas.rivera@devops.demo', role: 'founder' },
      pitchCompetition: true,
    },
  },
  {
    recordKey: 'mongo:expo-leads-148422',
    _id: 'ObjectId("682b4f449f0a4c00148422")',
    collection: 'expo_leads',
    doc: {
      leadId: 48422,
      booth: 'UX Baltic stand',
      contact: { name: 'Nina Bergström', email: 'nina.bergstrom@design.demo', role: 'designer' },
      swagShipped: false,
    },
  },
  {
    recordKey: 'mongo:workshop-rsvp-148422',
    _id: 'ObjectId("682b60109f0a4c00148422")',
    collection: 'workshop_rsvp',
    doc: {
      workshopId: 'design_systems_101',
      attendee: 'nina.bergstrom@design.demo',
      seat: 'A-14',
      checkedIn: false,
    },
  },
  {
    recordKey: 'mongo:workshop-rsvp-148344',
    _id: 'ObjectId("682b61109f0a4c00148344")',
    collection: 'workshop_rsvp',
    doc: {
      workshopId: 'llm_infra_masterclass',
      attendee: 'amira.hassan@ailab.edu',
      seat: 'FRONT-1',
      checkedIn: true,
    },
  },
  {
    recordKey: 'mongo:workshop-rsvp-148788',
    _id: 'ObjectId("682b62109f0a4c00148788")',
    collection: 'workshop_rsvp',
    doc: {
      workshopId: 'student_startup_101',
      attendee: 'zofia.k@student.demo',
      seat: 'B-22',
      checkedIn: false,
    },
  },
  {
    recordKey: 'mongo:workshop-rsvp-148567',
    _id: 'ObjectId("682b63109f0a4c00148567")',
    collection: 'workshop_rsvp',
    doc: {
      workshopId: 'healthtech_regulation',
      attendee: 'david.kim@healthtech.demo',
      seat: 'C-05',
      checkedIn: true,
    },
  },
  {
    recordKey: 'mongo:workshop-rsvp-148302',
    _id: 'ObjectId("682b64109f0a4c00148302")',
    collection: 'workshop_rsvp',
    doc: {
      workshopId: 'saas_metrics_deep_dive',
      attendee: 'lena.hoffmann@saas.demo',
      seat: 'D-11',
      waitlist: false,
    },
  },
];

export function visibleMysqlRows(records: RecordsMap): MysqlPiiRow[] {
  return MYSQL_ROWS.filter((row) => {
    const handle = deletionHandleForRow('mysql', row);
    if (!handle) return true;
    return records[handle]?.ui !== 'deleted';
  });
}

export function visiblePostgresRows(records: RecordsMap): PostgresRow[] {
  return POSTGRES_ROWS.filter((row) => {
    const handle = deletionHandleForRow('postgres', row);
    if (!handle) return true;
    return records[handle]?.ui !== 'deleted';
  });
}

export function visibleMongoDocuments(records: RecordsMap): MongoDocument[] {
  return MONGO_DOCUMENTS.filter((d) => {
    const handle = deletionHandleForRow('mongo', d);
    if (!handle) return true;
    return records[handle]?.ui !== 'deleted';
  });
}

export function deletableRemovedCount(
  engine: DbEngine,
  all: MysqlPiiRow[] | PostgresRow[] | MongoDocument[],
  records: RecordsMap
): { removed: number; deletableTotal: number } {
  const deletable = all
    .map((r) => deletionHandleForRow(engine, r))
    .filter((h): h is string => Boolean(h));
  const removed = deletable.filter((h) => records[h]?.ui === 'deleted').length;
  return { removed, deletableTotal: deletable.length };
}

function mongoCategory(collection: string): string {
  if (collection === 'scenario_records') return 'Record';
  if (collection === 'attendee_profiles') return 'Customer';
  if (collection === 'networking_sessions') return 'Meeting';
  if (collection === 'expo_leads') return 'Lead';
  if (collection === 'workshop_rsvp') return 'Training';
  return collection;
}

function mongoLabel(doc: MongoDocument): string {
  const d = doc.doc;
  if (doc.collection === 'scenario_records') {
    const type = typeof d.type === 'string' ? d.type : 'RECORD';
    const title = typeof d.title === 'string' ? d.title : doc._id;
    return `${title} · ${type}`;
  }
  if (doc.collection === 'attendee_profiles' && typeof d.name === 'string') {
    const pass = typeof d.pass === 'string' ? d.pass : 'profile';
    return `${d.name} · ${pass}`;
  }
  if (doc.collection === 'networking_sessions') {
    const type = typeof d.type === 'string' ? d.type : 'session';
    return `Matchmaking · ${type.replace(/_/g, ' ')}`;
  }
  if (doc.collection === 'expo_leads' && d.contact && typeof d.contact === 'object') {
    const c = d.contact as { name?: string; role?: string };
    const booth = typeof d.booth === 'string' ? d.booth : 'booth';
    return `${c.name ?? 'Lead'} · ${booth}`;
  }
  if (doc.collection === 'workshop_rsvp') {
    const w = typeof d.workshopId === 'string' ? d.workshopId : 'workshop';
    return `RSVP · ${w.replace(/_/g, ' ')}`;
  }
  return doc._id;
}

function mongoDetail(doc: MongoDocument): string {
  const d = doc.doc;
  if (doc.collection === 'scenario_records') {
    const fields = Object.keys(d).filter((k) => !['type', 'title', 'scenario', 'status'].includes(k));
    return fields.length > 0 ? fields.join(', ') : doc.collection;
  }
  if (doc.collection === 'attendee_profiles') {
    const parts = [d.email, d.company].filter((x) => typeof x === 'string');
    return parts.join(' · ') || doc.collection;
  }
  if (doc.collection === 'networking_sessions') {
    return Array.isArray(d.participants)
      ? `Participants: ${(d.participants as string[]).join(', ')}`
      : String(d.title ?? d.type ?? '');
  }
  if (doc.collection === 'expo_leads') {
    return `pitchDeckToken, gdprConsent=${String(d.gdprConsent ?? true)}`;
  }
  if (doc.collection === 'workshop_rsvp') {
    return `seat=${String(d.seat ?? '?')}, checkedIn=${String(d.checkedIn ?? false)}`;
  }
  return doc.collection;
}

export type ErasureByEngine = Record<DbEngine, RecordsMap>;

export function emptyErasureByEngine(): ErasureByEngine {
  return { mysql: {}, postgres: {}, mongo: {} };
}

export function deletableRecordKeys(engine: DbEngine): string[] {
  const rows =
    engine === 'mysql'
      ? MYSQL_ROWS
      : engine === 'postgres'
        ? POSTGRES_ROWS
        : MONGO_DOCUMENTS;
  return rows
    .map((r) => deletionHandleForRow(engine, r))
    .filter((h): h is string => Boolean(h));
}

export function allDeletableTargets(): { engine: DbEngine; key: string }[] {
  const engines: DbEngine[] = ['mysql', 'postgres', 'mongo'];
  return engines.flatMap((engine) =>
    deletableRecordKeys(engine).map((key) => ({ engine, key }))
  );
}

export function allDeletableTargetsFromSnapshot(snapshot: DbSnapshot): { engine: DbEngine; key: string }[] {
  const engines: DbEngine[] = ['mysql', 'postgres', 'mongo'];
  return engines.flatMap((engine) =>
    deletableRecordKeysFromSnapshot(engine, snapshot).map((key) => ({ engine, key }))
  );
}

export function homeDataItems(engine: DbEngine): HomeDataItem[] {
  return homeDataItemsFromSnapshot(engine, {
    mysql: MYSQL_ROWS,
    postgres: POSTGRES_ROWS,
    mongo: MONGO_DOCUMENTS,
  });
}

export type DbSnapshot = {
  mysql: MysqlPiiRow[];
  postgres: PostgresRow[];
  mongo: MongoDocument[];
};

export function homeDataItemsFromSnapshot(engine: DbEngine, snapshot: DbSnapshot): HomeDataItem[] {
  if (engine === 'mysql') {
    return snapshot.mysql.flatMap((row) => {
      const handle = deletionHandleForRow('mysql', row);
      if (!handle) return [];
      return [{
        id: handle,
        recordKey: handle,
        category: row.category,
        label: `${row.full_name} · ${row.pass_type}`,
        detail: row.payload_summary,
      }];
    });
  }
  if (engine === 'postgres') {
    return snapshot.postgres.flatMap((row) => {
      const handle = deletionHandleForRow('postgres', row);
      if (!handle) return [];
      return [{
        id: handle,
        recordKey: handle,
        category: row.source.replace(/_/g, ' '),
        label: `${row.contact_name} · ${row.interaction_type.replace(/_/g, ' ')}`,
        detail: row.metadata,
      }];
    });
  }
  return snapshot.mongo.flatMap((doc) => {
    const handle = deletionHandleForRow('mongo', doc);
    if (!handle) return [];
    return [{
      id: handle,
      recordKey: handle,
      category: mongoCategory(doc.collection),
      label: mongoLabel(doc),
      detail: mongoDetail(doc),
    }];
  });
}

/** Live DB rows plus tombstoned rows kept in UI erasure state (gone from DB, proof still visible). */
export function platformRecordUi(
  engine: DbEngine,
  recordKey: string | undefined,
  liveSnapshot: DbSnapshot,
  records: RecordsMap
): 'active' | 'deleted' | 'checking' {
  if (!recordKey) return 'active';
  const st = records[recordKey];
  if (st?.ui === 'checking') return 'checking';
  if (st?.ui === 'deleted' || st?.receipt) return 'deleted';
  const inLive = deletableRecordKeysFromSnapshot(engine, liveSnapshot).includes(recordKey);
  return inLive ? 'active' : 'deleted';
}

export function platformListStats(
  engine: DbEngine,
  catalog: DbSnapshot,
  liveSnapshot: DbSnapshot,
  records: RecordsMap
): { total: number; live: number; destroyed: number } {
  const items = homeDataItemsWithErasure(engine, catalog, liveSnapshot, records);
  let destroyed = 0;
  for (const item of items) {
    if (platformRecordUi(engine, item.recordKey, liveSnapshot, records) === 'deleted') {
      destroyed += 1;
    }
  }
  return {
    total: items.length,
    live: deletableRecordKeysFromSnapshot(engine, liveSnapshot).length,
    destroyed,
  };
}

/** Full platform list: scenario catalog + custom live rows + tombstoned rows after DB delete. */
export function homeDataItemsWithErasure(
  engine: DbEngine,
  catalog: DbSnapshot,
  liveSnapshot: DbSnapshot,
  records: RecordsMap
): HomeDataItem[] {
  const catalogItems = homeDataItemsFromSnapshot(engine, catalog);
  const knownKeys = new Set(catalogItems.map((i) => i.recordKey).filter(Boolean));
  const merged = [...catalogItems];

  for (const item of homeDataItemsFromSnapshot(engine, liveSnapshot)) {
    const key = item.recordKey;
    if (!key || knownKeys.has(key)) continue;
    knownKeys.add(key);
    merged.push(item);
  }

  for (const [recordKey, state] of Object.entries(records)) {
    if (!recordKey || knownKeys.has(recordKey)) continue;
    if (state?.ui !== 'deleted' && state?.ui !== 'checking' && !state?.receipt) continue;

    knownKeys.add(recordKey);
    const display = state.display;
    merged.push({
      id: recordKey,
      recordKey,
      category: display?.category ?? 'Removed',
      label: display?.label ?? recordKey.split('/').slice(-1)[0]?.replace(/-/g, ' ') ?? recordKey,
      detail:
        display?.detail ??
        (state.ui === 'deleted' ? 'Removed from database · CVDR on file' : 'Processing…'),
    });
  }

  return merged;
}

/** Keys selectable in the platform list: full catalog + custom live rows + erasure-tracked tombstones. */
export function catalogRecordKeys(
  engine: DbEngine,
  catalog: DbSnapshot,
  liveSnapshot: DbSnapshot,
  records: RecordsMap
): string[] {
  return homeDataItemsWithErasure(engine, catalog, liveSnapshot, records)
    .map((item) => item.recordKey ?? item.id)
    .filter(Boolean);
}

export function deletableRecordKeysFromSnapshot(engine: DbEngine, snapshot: DbSnapshot): string[] {
  const rows =
    engine === 'mysql'
      ? snapshot.mysql
      : engine === 'postgres'
        ? snapshot.postgres
        : snapshot.mongo;
  return rows
    .map((r) => deletionHandleForRow(engine, r))
    .filter((h): h is string => Boolean(h));
}
