"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
});

type ChartVideo = {
  rank: number;
  video_id: string;
  title: string;
  channel_name: string;
  category_name: string;
  thumbnail_url: string | null;
  global_view_count: number;
  countries_charting: number;
};

type CategoryScore = {
  category_name: string;
  rank_points: number;
};

type CountrySummary = {
  country_code: string;
  country_name: string;
  dominant_category: string;
  category_scores: CategoryScore[];
  top_video: ChartVideo;
  top_videos: ChartVideo[];
};

type GlobalTrend = {
  video_id: string;
  title: string;
  channel_name: string;
  category_name: string;
  countries_charting: number;
  best_rank: number;
  average_rank: number;
};

type YouTubeDataset = {
  generated_at: string;
  country_count: number;
  video_count: number;
  failed_country_count: number;
  countries: Record<string, CountrySummary>;
  global_trends: GlobalTrend[];
};

type CountryFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
};

type GeoDataset = {
  type: "FeatureCollection";
  features: CountryFeature[];
};

const CATEGORY_COLORS: Record<string, string> = {
  Music: "#ff4f9a",
  Entertainment: "#9b6dff",
  Gaming: "#31b7ff",
  "Film & Animation": "#ff9d47",
  Sports: "#42d392",
  Comedy: "#ffd166",
  News: "#ff6464",
  "News & Politics": "#ff6464",
  Education: "#4dd4c6",
  "People & Blogs": "#e879f9",
};

function getCategoryColor(category?: string) {
  if (!category) {
    return "#263044";
  }

  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }

  let hash = 0;

  for (const character of category) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }

  return `hsl(${Math.abs(hash) % 360} 70% 58%)`;
}

function getCountryCode(feature: CountryFeature) {
  const preferredCode = feature.properties.ISO_A2_EH;
  const standardCode = feature.properties.ISO_A2;

  if (
    typeof preferredCode === "string" &&
    preferredCode !== "-99"
  ) {
    return preferredCode;
  }

  if (
    typeof standardCode === "string" &&
    standardCode !== "-99"
  ) {
    return standardCode;
  }

  return null;
}

function getCountryName(feature: CountryFeature) {
  const properties = feature.properties;

  const possibleNames = [
    properties.NAME_EN,
    properties.NAME,
    properties.ADMIN,
  ];

  for (const name of possibleNames) {
    if (typeof name === "string") {
      return name;
    }
  }

  return "Unknown country";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSnapshotDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Home() {
  const [dataset, setDataset] = useState<YouTubeDataset | null>(null);
  const [geoData, setGeoData] = useState<GeoDataset | null>(null);
  const [selectedCode, setSelectedCode] = useState("CA");
  const [error, setError] = useState<string | null>(null);
  const [globeSize, setGlobeSize] = useState({
    width: 760,
    height: 650,
  });

  useEffect(() => {
    Promise.all([
      fetch("/data/latest.json").then((response) => {
        if (!response.ok) {
          throw new Error("Could not load YouTube chart data.");
        }

        return response.json();
      }),
      fetch("/data/countries.geojson").then((response) => {
        if (!response.ok) {
          throw new Error("Could not load country boundaries.");
        }

        return response.json();
      }),
    ])
      .then(([youtubeData, countries]) => {
        setDataset(youtubeData);
        setGeoData(countries);
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      });
  }, []);

  useEffect(() => {
    function updateGlobeSize() {
      const isDesktop = window.innerWidth >= 1000;

      setGlobeSize({
        width: isDesktop
          ? Math.floor(window.innerWidth * 0.62)
          : Math.max(340, window.innerWidth - 32),
        height: isDesktop ? 650 : 470,
      });
    }

    updateGlobeSize();
    window.addEventListener("resize", updateGlobeSize);

    return () => {
      window.removeEventListener("resize", updateGlobeSize);
    };
  }, []);

  const polygons = useMemo(() => {
    if (!geoData) {
      return [];
    }

    return geoData.features.filter(
      (feature) => getCountryCode(feature) !== "AQ",
    );
  }, [geoData]);

  const selectedCountry = dataset?.countries[selectedCode] ?? null;
  const widestTrend = dataset?.global_trends?.[0] ?? null;

  function getPolygonLabel(polygon: object) {
    const feature = polygon as CountryFeature;
    const code = getCountryCode(feature);
    const country = code && dataset
      ? dataset.countries[code]
      : null;

    if (!country) {
      return `
        <div class="globe-tooltip">
          <strong>${escapeHtml(getCountryName(feature))}</strong>
          <span>No chart data available</span>
        </div>
      `;
    }

    return `
      <div class="globe-tooltip">
        <span class="tooltip-kicker">${escapeHtml(country.country_code)}</span>
        <strong>${escapeHtml(country.country_name)}</strong>
        <span>${escapeHtml(country.dominant_category)} leads the chart</span>
        <span class="tooltip-title">#1 ${escapeHtml(country.top_video.title)}</span>
      </div>
    `;
  }

  function selectPolygon(polygon: object) {
    const feature = polygon as CountryFeature;
    const code = getCountryCode(feature);

    if (code && dataset?.countries[code]) {
      setSelectedCode(code);
    }
  }

  if (error) {
    return (
      <main className="error-screen">
        <p>VideoPulse Atlas could not start.</p>
        <strong>{error}</strong>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">VP</div>

          <div>
            <p className="eyebrow">Global YouTube intelligence</p>
            <h1>VideoPulse Atlas</h1>
          </div>
        </div>

        <div className="live-status">
          <span className="live-dot" />
          Chart snapshot
        </div>
      </header>

      <section className="summary-strip">
        <div className="summary-item">
          <span>Regions mapped</span>
          <strong>{dataset?.country_count ?? "..."}</strong>
        </div>

        <div className="summary-item">
          <span>Unique videos</span>
          <strong>{dataset?.video_count ?? "..."}</strong>
        </div>

        <div className="summary-item wide">
          <span>Largest cross border trend</span>
          <strong>
            {widestTrend
              ? `${widestTrend.title} · ${widestTrend.countries_charting} regions`
              : "Loading chart data"}
          </strong>
        </div>

        <div className="summary-item">
          <span>Collected</span>
          <strong>
            {dataset
              ? formatSnapshotDate(dataset.generated_at)
              : "..."}
          </strong>
        </div>
      </section>

      <section className="dashboard">
        <div className="globe-panel">
          <div className="globe-heading">
            <div>
              <p className="eyebrow">Explore the chart</p>
              <h2>What is the world watching?</h2>
            </div>

            <p className="globe-instruction">
              Hover to inspect. Select a country to open its chart.
            </p>
          </div>

          {!dataset || !geoData ? (
            <div className="loading-state">
              <div className="loading-orbit" />
              <p>Mapping global chart signals</p>
            </div>
          ) : (
            <div className="globe-stage">
              <Globe
                width={globeSize.width}
                height={globeSize.height}
                backgroundColor="rgba(0,0,0,0)"
                showAtmosphere
                atmosphereColor="#54d6ff"
                atmosphereAltitude={0.16}
                polygonsData={polygons}
                polygonAltitude={(polygon) => {
                  const feature = polygon as CountryFeature;
                  const code = getCountryCode(feature);

                  if (code === selectedCode) {
                    return 0.055;
                  }

                  return code && dataset.countries[code]
                    ? 0.025
                    : 0.008;
                }}
                polygonCapColor={(polygon) => {
                  const feature = polygon as CountryFeature;
                  const code = getCountryCode(feature);
                  const country = code
                    ? dataset.countries[code]
                    : null;

                  if (code === selectedCode) {
                    return "#ffffff";
                  }

                  return country
                    ? getCategoryColor(country.dominant_category)
                    : "#1a2232";
                }}
                polygonSideColor={() => "rgba(10, 16, 28, 0.72)"}
                polygonStrokeColor={() => "rgba(255, 255, 255, 0.2)"}
                polygonLabel={getPolygonLabel}
                onPolygonClick={selectPolygon}
              />
            </div>
          )}

          <div className="legend">
            {Object.entries(CATEGORY_COLORS)
              .slice(0, 6)
              .map(([category, color]) => (
                <div className="legend-item" key={category}>
                  <span style={{ backgroundColor: color }} />
                  {category}
                </div>
              ))}
          </div>
        </div>

        <aside className="country-panel">
          {selectedCountry ? (
            <>
              <div className="country-header">
                <div>
                  <p className="eyebrow">
                    {selectedCountry.country_code}
                  </p>
                  <h2>{selectedCountry.country_name}</h2>
                </div>

                <div
                  className="category-badge"
                  style={{
                    color: getCategoryColor(
                      selectedCountry.dominant_category,
                    ),
                  }}
                >
                  {selectedCountry.dominant_category}
                </div>
              </div>

              <a
                className="feature-card"
                href={`https://www.youtube.com/watch?v=${selectedCountry.top_video.video_id}`}
                target="_blank"
                rel="noreferrer"
              >
                {selectedCountry.top_video.thumbnail_url && (
                  <img
                    src={selectedCountry.top_video.thumbnail_url}
                    alt=""
                  />
                )}

                <div className="feature-overlay" />

                <div className="feature-copy">
                  <span className="rank-label">Number one</span>
                  <h3>{selectedCountry.top_video.title}</h3>
                  <p>{selectedCountry.top_video.channel_name}</p>

                  <div className="video-metrics">
                    <span>
                      {formatNumber(
                        selectedCountry.top_video.global_view_count,
                      )}{" "}
                      global views
                    </span>

                    <span>
                      {selectedCountry.top_video.countries_charting}{" "}
                      regions
                    </span>
                  </div>
                </div>
              </a>

              <section className="panel-section">
                <div className="section-heading">
                  <h3>Category signal</h3>
                  <span>Rank weighted</span>
                </div>

                <div className="category-list">
                  {selectedCountry.category_scores
                    .slice(0, 4)
                    .map((category) => {
                      const maximum =
                        selectedCountry.category_scores[0]
                          ?.rank_points || 1;

                      return (
                        <div
                          className="category-row"
                          key={category.category_name}
                        >
                          <div className="category-copy">
                            <span>{category.category_name}</span>
                            <strong>{category.rank_points}</strong>
                          </div>

                          <div className="category-track">
                            <div
                              style={{
                                width: `${
                                  (category.rank_points / maximum) * 100
                                }%`,
                                backgroundColor: getCategoryColor(
                                  category.category_name,
                                ),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-heading">
                  <h3>Chart leaders</h3>
                  <span>Top five</span>
                </div>

                <div className="ranking-list">
                  {selectedCountry.top_videos
                    .slice(0, 5)
                    .map((video) => (
                      <a
                        href={`https://www.youtube.com/watch?v=${video.video_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ranking-row"
                        key={video.video_id}
                      >
                        <span className="ranking-number">
                          {video.rank}
                        </span>

                        <div>
                          <strong>{video.title}</strong>
                          <span>
                            {video.channel_name} ·{" "}
                            {video.category_name}
                          </span>
                        </div>
                      </a>
                    ))}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-country">
              <p>Select a highlighted country to inspect its chart.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}