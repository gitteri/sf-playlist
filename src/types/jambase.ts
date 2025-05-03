export interface JamBaseResponse {
  success: boolean;
  data: {
    results: {
      chunked: Record<string, JamBaseDateChunk>;
      total_pages: number;
      total_items: number;
    };
  };
}

export interface JamBaseDateChunk {
  heading_parts: {
    day_of_week: string;
    date_formatted: string;
  };
  heading_parts_sort: string[];
  items: JamBaseEvent[];
}

export interface JamBaseEvent {
  ID: number;
  type: string;
  permalink: string;
  when: string;
  title: string;
  description: string;
  date_formatted: string;
  start_date: {
    yyyymmdd: number;
    formatted: string;
  };
  end_date: any;
  time: any;
  venue_name: string;
  bands: string[] | null;
  date_range_parts: any;
  location: string;
  is_featured: boolean;
  is_enhanced: boolean;
  image_url: string;
  image_composed: string;
  user_is_going: any;
} 