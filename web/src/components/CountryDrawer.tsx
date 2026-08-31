"use client";

import { formatCompact, getCategoryColor } from "@/lib/format";
import type { CountrySummary } from "@/types";

interface CountryDrawerProps {
  // Holds the last selected country so its content stays visible while the
  // panel slides out; the parent never clears it.
  country: CountrySummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CountryDrawer({
  country,
  isOpen,
  onClose,
}: CountryDrawerProps) {
  return (
    <aside
      className={`country-drawer${isOpen ? " is-open" : ""}`}
      aria-hidden={!isOpen}
    >
      {country && (
        <>
          <div className="drawer-header">
            <div>
              <p className="eyebrow">{country.country_code}</p>
              <h2>{country.country_name}</h2>
            </div>

            <button
              type="button"
              className="drawer-close"
              onClick={onClose}
              aria-label="Close country panel"
            >
              ✕
            </button>
          </div>

          <span
            className="category-badge"
            style={{ color: getCategoryColor(country.dominant_category) }}
          >
            {country.dominant_category}
          </span>

          <a
            className="feature-card"
            href={`https://www.youtube.com/watch?v=${country.top_video.video_id}`}
            target="_blank"
            rel="noreferrer"
          >
            {country.top_video.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={country.top_video.thumbnail_url} alt="" />
            )}

            <div className="feature-overlay" />

            <div className="feature-copy">
              <span className="rank-label">Number one</span>
              <h3>{country.top_video.title}</h3>
              <p>{country.top_video.channel_name}</p>

              <div className="video-metrics">
                <span>
                  {formatCompact(country.top_video.global_view_count)} global
                  views
                </span>
                <span>{country.top_video.countries_charting} regions</span>
              </div>
            </div>
          </a>

          <section className="drawer-section">
            <div className="section-heading">
              <h3>Category signal</h3>
              <span>Rank weighted</span>
            </div>

            {country.category_scores.slice(0, 4).map((category) => {
              const maximum = country.category_scores[0]?.rank_points || 1;

              return (
                <div className="category-row" key={category.category_name}>
                  <div className="row-top">
                    <span>{category.category_name}</span>
                    <strong>{category.rank_points}</strong>
                  </div>

                  <div className="category-track">
                    <div
                      style={{
                        width: `${(category.rank_points / maximum) * 100}%`,
                        backgroundColor: getCategoryColor(
                          category.category_name,
                        ),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <h3>Chart leaders</h3>
              <span>Top five</span>
            </div>

            <div className="ranking-list">
              {country.top_videos.slice(0, 5).map((video) => (
                <a
                  key={video.video_id}
                  className="ranking-row"
                  href={`https://www.youtube.com/watch?v=${video.video_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="ranking-number">{video.rank}</span>
                  <span className="ranking-copy">
                    <span className="r-title">{video.title}</span>
                    <span className="r-sub">
                      {video.channel_name} · {video.category_name}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
