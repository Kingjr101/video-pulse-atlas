export type ChartVideo = {
  rank: number;
  video_id: string;
  title: string;
  channel_name: string;
  category_name: string;
  thumbnail_url: string | null;
  global_view_count: number;
  countries_charting: number;
};

export type CategoryScore = {
  category_name: string;
  rank_points: number;
};

export type CountrySummary = {
  country_code: string;
  country_name: string;
  dominant_category: string;
  category_scores: CategoryScore[];
  top_video: ChartVideo;
  top_videos: ChartVideo[];
};

export type YouTubeDataset = {
  generated_at: string;
  country_count: number;
  video_count: number;
  failed_country_count: number;
  countries: Record<string, CountrySummary>;
  global_trends: unknown[];
};

export type CountryFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
};

export type GeoDataset = {
  type: "FeatureCollection";
  features: CountryFeature[];
};
