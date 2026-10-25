import crypto from "node:crypto";

export type UpcomingEvent = {
  id: string;
  name: string;
  summary: string | null;
  url: string;
  startIso: string | null;
  endIso: string | null;
  startLocal: string | null;
  venue: string | null;
  imageUrl: string | null;
  isOnline: boolean;
  isFree: boolean;
  organizer: string;
};

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const BURGESS_URL = "https://www.eventbrite.com/o/burgess-institute-14747511979";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function dig(value: unknown, keys: string[]): unknown {
  let node: unknown = value;
  for (const key of keys) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function stringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function normalizeEvent(raw: unknown, organizer: string): UpcomingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const url = stringField(record, "url");
  const name = stringField(record, "name") || stringField(record, "title");
  if (!url || !name) return null;
  const start = record.start as Record<string, unknown> | undefined;
  const end = record.end as Record<string, unknown> | undefined;
  const startIso = toIso(record.start_date) || toIso(start?.utc) || toIso(start?.local);
  const endIso = toIso(record.end_date) || toIso(end?.utc) || toIso(end?.local);
  const startLocal = (typeof start?.local === "string" ? start.local : null) || (typeof record.start_date === "string" ? (record.start_date as string) : null);
  const venue = stringField(record.venue as Record<string, unknown> | undefined, "name")
    || stringField(record.primary_venue as Record<string, unknown> | undefined, "name")
    || stringField(record.primary_venue as Record<string, unknown> | undefined, "address_line_1");
  const image = (record.image as Record<string, unknown> | undefined) || (record.logo as Record<string, unknown> | undefined);
  const imageUrl = stringField(image, "url") || stringField(image, "original") || null;
  const isOnline = Boolean(record.is_online_event ?? record.online_event ?? false);
  const isFree = Boolean(record.is_free ?? record.free ?? false);
  const summary = stringField(record, "summary") || stringField(record, "description");
  const id = stringField(record, "id") || crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
  return { id, name, summary, url, startIso, endIso, startLocal, venue, imageUrl, isOnline, isFree, organizer };
}

function dedupe(events: UpcomingEvent[]): UpcomingEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = event.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchBurgessEvents(fetcher: Fetcher = fetch): Promise<UpcomingEvent[]> {
  try {
    const response = await fetcher(BURGESS_URL, {
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const nextData = extractNextData(html);
    if (!nextData) return [];
    const upcoming = dig(nextData, ["props", "pageProps", "upcomingEvents"]);
    const list = Array.isArray(upcoming) ? upcoming : [];
    const events = list
      .map((raw) => normalizeEvent(raw, "Burgess Institute"))
      .filter((event): event is UpcomingEvent => Boolean(event))
      .sort((a, b) => (a.startIso ?? "").localeCompare(b.startIso ?? ""));
    return dedupe(events);
  } catch {
    return [];
  }
}

export function filterFutureEvents(events: UpcomingEvent[], now = new Date()): UpcomingEvent[] {
  const nowMs = now.getTime();
  return events.filter((event) => {
    if (!event.startIso) return true;
    const ends = event.endIso ? new Date(event.endIso).getTime() : new Date(event.startIso).getTime() + 2 * 60 * 60 * 1000;
    return ends >= nowMs;
  });
}
