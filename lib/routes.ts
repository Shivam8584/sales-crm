/** Every in-app path lives here; pages, emails, push and notifications build links from these. */
const PIPELINE = "/pipeline";
const RECORDS = "/records";
const INSIGHTS = "/insights";
const AUTOMATION = "/automation";
const SETTINGS = "/settings";

export const routes = {
  today: "/today",
  inbox: "/inbox",
  tasks: "/tasks",
  prospecting: `${PIPELINE}/prospecting`,
  prospect: (key: string) => `${PIPELINE}/prospecting/${key}`,
  leads: `${PIPELINE}/leads`,
  lead: (id: string) => `${PIPELINE}/leads/${id}`,
  deals: `${PIPELINE}/deals`,
  deal: (id: string, tab?: string) =>
    `${PIPELINE}/deals/${id}${tab ? `?tab=${tab}` : ""}`,
  activation: `${PIPELINE}/activation`,
  sequences: `${AUTOMATION}/sequences`,
  sequence: (id: string) => `${AUTOMATION}/sequences/${id}`,
  agents: `${AUTOMATION}/agents`,
  agent: (id: string) => `${AUTOMATION}/agents/${id}`,
  accounts: `${RECORDS}/accounts`,
  account: (id: string) => `${RECORDS}/accounts/${id}`,
  accountReport: (id: string, kind?: string, key?: string) =>
    `${RECORDS}/accounts/${id}/report${kind ? `?kind=${kind}${key ? `&key=${key}` : ""}` : ""}`,
  people: `${RECORDS}/people`,
  person: (id: string) => `${RECORDS}/people/${id}`,
  reports: `${INSIGHTS}/reports`,
  activity: `${INSIGHTS}/activity`,
  playbook: `${INSIGHTS}/playbook`,
  settings: SETTINGS,
  profile: `${SETTINGS}/profile`,
  team: `${SETTINGS}/team`,
  workspace: `${SETTINGS}/workspace`,
  fields: `${SETTINGS}/fields`,
  targets: `${SETTINGS}/targets`,
  duplicates: `${SETTINGS}/duplicates`,
  audit: `${SETTINGS}/audit`,
  integrations: `${SETTINGS}/integrations`,
  system: `${SETTINGS}/system`,
} as const;

const RECORD_PATH = {
  accounts: routes.account,
  people: routes.person,
  leads: routes.lead,
  deals: (id: string) => routes.deal(id),
};

export type RecordPathType = keyof typeof RECORD_PATH;

export function recordPath(type: RecordPathType, id: string) {
  return RECORD_PATH[type](id);
}

/** The record a path like `/pipeline/deals/abc?tab=proposal` shows, if any. */
export function parseRecordPath(path: string | undefined | null) {
  const match = path?.match(
    /^\/(?:records\/(accounts|people)|pipeline\/(leads|deals))\/([a-z0-9]+)(?=[/?#]|$)/,
  );
  return match
    ? { type: (match[1] ?? match[2]) as RecordPathType, id: match[3] }
    : null;
}

const LEGACY: Record<string, string> = {
  leads: routes.leads,
  deals: routes.deals,
  prospecting: routes.prospecting,
  activation: routes.activation,
  automations: routes.sequences,
  accounts: routes.accounts,
  people: routes.people,
  reports: routes.reports,
  activity: routes.activity,
  playbook: routes.playbook,
};

/** Maps a pre-restructure path (`/leads/abc?x=1`) onto the current one; other paths pass through. */
export function fromLegacyPath(path: string) {
  const match = /^\/([a-z]+)(?=[/?#]|$)/.exec(path);
  const target = match && LEGACY[match[1]];
  return target ? target + path.slice(match[0].length) : path;
}
