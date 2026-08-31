"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountryDrawer } from "@/components/CountryDrawer";
import type {
  CountryFeature,
  CountrySummary,
  GeoDataset,
  YouTubeDataset,
} from "@/types";

const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
});

function getCountryCode(feature: CountryFeature): string | null {
  const preferred = feature.properties.ISO_A2_EH;
  const standard = feature.properties.ISO_A2;

  if (typeof preferred === "string" && preferred !== "-99") {
    return preferred;
  }

  if (typeof standard === "string" && standard !== "-99") {
    return standard;
  }

  return null;
}

function getCountryName(feature: CountryFeature): string {
  const properties = feature.properties;

  for (const key of ["NAME_EN", "NAME", "ADMIN"] as const) {
    const value = properties[key];
    if (typeof value === "string") {
      return value;
    }
  }

  return "Unknown country";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type LngLat = [number, number];

/** Flatten a Polygon / MultiPolygon feature into a list of boundary rings. */
function extractRings(feature: CountryFeature): LngLat[][] {
  const geometry = feature.geometry as {
    type?: string;
    coordinates?: unknown;
  } | null;

  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  const rings: LngLat[][] = [];

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates as LngLat[][]) {
      rings.push(ring);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates as LngLat[][][]) {
      for (const ring of polygon) {
        rings.push(ring);
      }
    }
  }

  return rings;
}

// three-globe path points are [lat, lng]; GeoJSON coordinates are [lng, lat].
function ringToPath(ring: LngLat[]): LngLat[] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

type BorderPath = {
  points: LngLat[];
  kind: "border" | "glow" | "core";
};

export default function Home() {
  const [dataset, setDataset] = useState<YouTubeDataset | null>(null);
  const [geoData, setGeoData] = useState<GeoDataset | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [drawerCountry, setDrawerCountry] = useState<CountrySummary | null>(
    null,
  );
  const [hoverCode, setHoverCode] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 960, height: 720 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);

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
    function updateSize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedCode(null);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Only countries that actually have chart data are interactive.
  const polygons = useMemo(() => {
    if (!geoData || !dataset) {
      return [];
    }

    return geoData.features.filter((feature) => {
      const code = getCountryCode(feature);
      return code !== null && Boolean(dataset.countries[code]);
    });
  }, [geoData, dataset]);

  // Soft white outline drawn just above every charting country's border.
  const borderPaths = useMemo<BorderPath[]>(() => {
    return polygons.flatMap((feature) =>
      extractRings(feature as CountryFeature).map((ring) => ({
        points: ringToPath(ring),
        kind: "border" as const,
      })),
    );
  }, [polygons]);

  // The selected country's border, doubled up: a wide soft glow + a bright
  // metallic core. No fill — outline only.
  const selectedPaths = useMemo<BorderPath[]>(() => {
    if (!selectedCode || !geoData) {
      return [];
    }

    const feature = geoData.features.find(
      (item) => getCountryCode(item) === selectedCode,
    );
    if (!feature) {
      return [];
    }

    return extractRings(feature).flatMap((ring) => {
      const points = ringToPath(ring);
      return [
        { points, kind: "glow" as const },
        { points, kind: "core" as const },
      ];
    });
  }, [selectedCode, geoData]);

  const pathsData = useMemo(
    () => [...borderPaths, ...selectedPaths],
    [borderPaths, selectedPaths],
  );

  const pathPoints = useCallback(
    (path: object) => (path as BorderPath).points,
    [],
  );

  const pathPointAlt = useCallback(
    (path: object) => ((path as BorderPath).kind === "border" ? 0.006 : 0.064),
    [],
  );

  const pathColor = useCallback((path: object) => {
    switch ((path as BorderPath).kind) {
      case "core":
        // Liquid-metal sheen swept along the outline.
        return ["#ffffff", "#bcd4ff", "#efe2ff", "#cfe0ff", "#ffffff"];
      case "glow":
        return "rgba(255, 255, 255, 0.18)";
      default:
        return "rgba(255, 255, 255, 0.32)";
    }
  }, []);

  const pathStroke = useCallback((path: object) => {
    switch ((path as BorderPath).kind) {
      case "glow":
        return 4.5;
      case "core":
        return 1.7;
      default:
        return 0; // falsy -> thin line for ordinary borders
    }
  }, []);

  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) {
      return;
    }

    // Set the opening view once — the camera is never moved again on select.
    globe.pointOfView({ lat: 18, lng: 8, altitude: 2.5 }, 0);

    const controls = globe.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.minDistance = 175;
      controls.maxDistance = 520;
    }
  }, []);

  // Pause the idle spin while a country panel is open; do not recenter.
  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (controls) {
      controls.autoRotate = selectedCode === null;
    }
  }, [selectedCode]);

  const polygonCapColor = useCallback(
    (polygon: object) => {
      const code = getCountryCode(polygon as CountryFeature);

      // Selected country is outline-only — effectively no fill.
      if (code && code === selectedCode) {
        return "rgba(255, 255, 255, 0.04)";
      }

      if (code && code === hoverCode) {
        return "rgba(255, 255, 255, 0.1)";
      }

      return "rgba(120, 175, 255, 0.03)";
    },
    [selectedCode, hoverCode],
  );

  const polygonAltitude = useCallback(
    (polygon: object) => {
      const code = getCountryCode(polygon as CountryFeature);

      if (code && code === selectedCode) {
        return 0.06;
      }

      if (code && code === hoverCode) {
        return 0.02;
      }

      return 0.006;
    },
    [selectedCode, hoverCode],
  );

  const polygonSideColor = useCallback(
    (polygon: object) => {
      const code = getCountryCode(polygon as CountryFeature);
      return code && code === selectedCode
        ? "rgba(214, 228, 255, 0.08)"
        : "rgba(120, 170, 255, 0.1)";
    },
    [selectedCode],
  );

  const polygonStrokeColor = useCallback(
    (polygon: object) => {
      const code = getCountryCode(polygon as CountryFeature);

      if (code && code === selectedCode) {
        return "rgba(255, 255, 255, 0.9)";
      }

      if (code && code === hoverCode) {
        return "rgba(255, 255, 255, 0.7)";
      }

      // A bit more visible than before, to read as a soft border.
      return "rgba(255, 255, 255, 0.42)";
    },
    [selectedCode, hoverCode],
  );

  const polygonLabel = useCallback(
    (polygon: object) => {
      const feature = polygon as CountryFeature;
      const code = getCountryCode(feature);
      const country = code ? dataset?.countries[code] : null;

      if (!country) {
        return `
          <div class="globe-tooltip">
            <strong>${escapeHtml(getCountryName(feature))}</strong>
            <span>No chart data</span>
          </div>
        `;
      }

      return `
        <div class="globe-tooltip">
          <span class="kicker">${escapeHtml(country.country_code)}</span>
          <strong>${escapeHtml(country.country_name)}</strong>
          <span>${escapeHtml(country.dominant_category)} leads the chart</span>
          <span class="title">#1 ${escapeHtml(country.top_video.title)}</span>
        </div>
      `;
    },
    [dataset],
  );

  const handlePolygonClick = useCallback(
    (polygon: object) => {
      const code = getCountryCode(polygon as CountryFeature);
      const country = code ? dataset?.countries[code] : null;
      if (code && country) {
        setHasInteracted(true);
        setSelectedCode(code);
        setDrawerCountry(country);
      }
    },
    [dataset],
  );

  const handlePolygonHover = useCallback((polygon: object | null) => {
    setHoverCode(
      polygon ? getCountryCode(polygon as CountryFeature) : null,
    );
  }, []);

  if (error) {
    return (
      <main className="error-screen">
        <p>VideoPulse Atlas could not start.</p>
        <strong>{error}</strong>
      </main>
    );
  }

  const ready = Boolean(dataset && geoData);

  return (
    <main className="globe-view">
      {!ready && (
        <div className="globe-loading">
          <div className="orbit" />
          <p>Mapping global chart signals</p>
        </div>
      )}

      {ready && (
        <div
          className="globe-canvas"
          onPointerDown={() => setHasInteracted(true)}
        >
          <Globe
            ref={globeRef}
            width={size.width}
            height={size.height}
            onGlobeReady={handleGlobeReady}
            backgroundColor="#00000a"
            backgroundImageUrl="/textures/night-sky.png"
            globeImageUrl="/textures/earth-blue-marble.jpg"
            bumpImageUrl="/textures/earth-topology.png"
            showAtmosphere
            atmosphereColor="#8fc4ff"
            atmosphereAltitude={0.16}
            polygonsData={polygons}
            polygonAltitude={polygonAltitude}
            polygonCapColor={polygonCapColor}
            polygonSideColor={polygonSideColor}
            polygonStrokeColor={polygonStrokeColor}
            polygonLabel={polygonLabel}
            polygonsTransitionDuration={220}
            onPolygonClick={handlePolygonClick}
            onPolygonHover={handlePolygonHover}
            pathsData={pathsData}
            pathPoints={pathPoints}
            pathPointAlt={pathPointAlt}
            pathColor={pathColor}
            pathStroke={pathStroke}
            pathResolution={2}
            pathTransitionDuration={0}
          />
        </div>
      )}

      <header className="app-header">
        <div className="brand-mark">VP</div>
        <div className="brand-text">
          <p className="eyebrow">Global YouTube intelligence</p>
          <h1>VideoPulse Atlas</h1>
        </div>
      </header>

      {ready && (
        <div
          className={`globe-hint${
            hasInteracted || selectedCode ? " is-hidden" : ""
          }`}
        >
          <span className="dot" />
          Drag to spin the globe · click a country for its charts
        </div>
      )}

      <div
        className={`drawer-scrim${selectedCode ? " is-open" : ""}`}
        aria-hidden="true"
      />
      <CountryDrawer
        country={drawerCountry}
        isOpen={selectedCode !== null}
        onClose={() => setSelectedCode(null)}
      />
    </main>
  );
}
