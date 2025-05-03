export interface Concert {
  artist: string;
  venue: string;
  date: Date;
  ticketUrl?: string;
  source: string;
}

export interface Venue {
  name: string;
  address: string;
  website?: string;
} 