export interface EventResponse {
  events: Event[];
  aggregations: {
    event_fingerprint: {
      doc_count_error_upper_bound: number;
      sum_other_doc_count: number;
      buckets: Bucket[];
    };
  };
  total: number;
  pages: number;
  current: number;
}

export interface Event {
  _index: string;
  _type: string;
  _id: string;
  _score: null;
  _source: EventSource;
  sort: number[];
}

export interface EventSource {
  id: number;
  calendar_id: number;
  starred: boolean;
  parent_id: null;
  slug: string;
  description: string;
  multimedia: Multimedia[];
  tickets: Ticket[] | null;
  venue_id: number;
  name: string;
  starttime: string;
  endtime: string | null;
  restrictions: string;
  ticketurl: string;
  created_at: string;
  updated_at: string;
  user_id: number;
  recurring_id: number | null;
  status: string;
  moreinfo: string;
  allday: boolean;
  allday_text: string;
  summary: string;
  organizer_id: null;
  scraper_id: null;
  eventpage: null;
  organization_id: number;
  curated_at: null;
  collection_expires_at: null;
  tags: any[];
  eventbrite_uid: null;
  simpletix_uid: null;
  hidden_until: null;
  promoted_exclusively_to: any[];
  has_paid_promotions: null;
  event_fingerprint: string[];
  geo: number[];
  categories: Category[];
  lists: List[];
  user: User;
  organization: Organization;
  venue: Venue;
  children: any[];
}

export interface Multimedia {
  source: string;
  id: string;
  type: string;
  image: string;
}

export interface Ticket {
  name: string;
  price: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface List {
  id: number;
  name: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface Organization {
  id: number;
  name: string;
}

export interface Venue {
  id: number;
  name: string;
  description: string | null;
  url: string | null;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  facebook: string | null;
  twitter: string | null;
  city: string;
  state: string;
  zip: string;
  neighborhood_id: null;
  timezone: string;
  country: string;
  online: boolean;
}

export interface Bucket {
  key: string;
  doc_count: number;
} 