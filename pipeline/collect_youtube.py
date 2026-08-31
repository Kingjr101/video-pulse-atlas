import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIRECTORY = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIRECTORY = PROJECT_ROOT / "data" / "processed"

RAW_DIRECTORY.mkdir(parents=True, exist_ok=True)
PROCESSED_DIRECTORY.mkdir(parents=True, exist_ok=True)

load_dotenv(PROJECT_ROOT / ".env")

API_KEY = os.getenv("YOUTUBE_API_KEY")
BASE_URL = "https://www.googleapis.com/youtube/v3"
VIDEOS_PER_COUNTRY = 10

if not API_KEY:
    raise RuntimeError("YOUTUBE_API_KEY was not found in the .env file.")


session = requests.Session()

retry_strategy = Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET"],
)

session.mount("https://", HTTPAdapter(max_retries=retry_strategy))


def youtube_get(resource, parameters):
    request_parameters = {
        **parameters,
        "key": API_KEY,
    }

    try:
        response = session.get(
            f"{BASE_URL}/{resource}",
            params=request_parameters,
            timeout=30,
        )
        response_data = response.json()
    except requests.RequestException as error:
        raise RuntimeError(f"Could not connect to YouTube: {error}") from error
    except ValueError as error:
        raise RuntimeError("YouTube returned invalid JSON.") from error

    if response.status_code != 200:
        message = response_data.get("error", {}).get(
            "message",
            "YouTube returned an unknown error.",
        )
        raise RuntimeError(message)

    return response_data


def get_supported_regions():
    response = youtube_get(
        "i18nRegions",
        {
            "part": "snippet",
            "hl": "en_US",
        },
    )

    regions = []

    for item in response.get("items", []):
        regions.append(
            {
                "country_code": item["id"],
                "country_name": item["snippet"]["name"],
            }
        )

    return sorted(regions, key=lambda region: region["country_name"])


def get_categories():
    response = youtube_get(
        "videoCategories",
        {
            "part": "snippet",
            "regionCode": "US",
            "hl": "en_US",
        },
    )

    return {
        item["id"]: item["snippet"]["title"]
        for item in response.get("items", [])
    }


def get_country_chart(country_code):
    return youtube_get(
        "videos",
        {
            "part": "snippet,statistics,contentDetails",
            "chart": "mostPopular",
            "regionCode": country_code,
            "maxResults": VIDEOS_PER_COUNTRY,
        },
    )


def get_thumbnail(snippet):
    thumbnails = snippet.get("thumbnails", {})

    for size in ["maxres", "standard", "high", "medium", "default"]:
        if size in thumbnails:
            return thumbnails[size]["url"]

    return None


def create_record(
    item,
    rank,
    country_code,
    country_name,
    category_names,
    collected_at,
):
    snippet = item["snippet"]
    statistics = item.get("statistics", {})
    content_details = item.get("contentDetails", {})

    category_id = snippet.get("categoryId")
    category_name = category_names.get(
        category_id,
        f"Unknown category {category_id}",
    )

    return {
        "snapshot_at": collected_at,
        "country_code": country_code,
        "country_name": country_name,
        "rank": rank,
        "rank_points": VIDEOS_PER_COUNTRY + 1 - rank,
        "video_id": item["id"],
        "title": snippet.get("title"),
        "channel_id": snippet.get("channelId"),
        "channel_name": snippet.get("channelTitle"),
        "category_id": category_id,
        "category_name": category_name,
        "published_at": snippet.get("publishedAt"),
        "duration": content_details.get("duration"),
        "global_view_count": int(statistics.get("viewCount", 0)),
        "global_like_count": int(statistics.get("likeCount", 0)),
        "global_comment_count": int(statistics.get("commentCount", 0)),
        "thumbnail_url": get_thumbnail(snippet),
    }


def build_country_summaries(dataframe):
    summaries = {}

    for country_code, country_data in dataframe.groupby("country_code"):
        country_data = country_data.sort_values("rank")
        top_video = country_data.iloc[0]

        category_scores = (
            country_data.groupby("category_name", as_index=False)["rank_points"]
            .sum()
            .sort_values(
                ["rank_points", "category_name"],
                ascending=[False, True],
            )
        )

        dominant_category = category_scores.iloc[0]["category_name"]

        summaries[country_code] = {
            "country_code": country_code,
            "country_name": top_video["country_name"],
            "dominant_category": dominant_category,
            "category_scores": category_scores.to_dict(orient="records"),
            "top_video": {
                "video_id": top_video["video_id"],
                "title": top_video["title"],
                "channel_name": top_video["channel_name"],
                "category_name": top_video["category_name"],
                "thumbnail_url": top_video["thumbnail_url"],
                "global_view_count": int(top_video["global_view_count"]),
                "countries_charting": int(top_video["countries_charting"]),
            },
            "top_videos": country_data[
                [
                    "rank",
                    "video_id",
                    "title",
                    "channel_name",
                    "category_name",
                    "thumbnail_url",
                    "global_view_count",
                    "countries_charting",
                ]
            ].to_dict(orient="records"),
        }

    return summaries


def main():
    collected_at = datetime.now(timezone.utc).isoformat()
    filename_timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    regions = get_supported_regions()
    category_names = get_categories()

    records = []
    failures = []
    raw_charts = {}

    print(f"\nCollecting charts from {len(regions)} supported regions...\n")

    for position, region in enumerate(regions, start=1):
        country_code = region["country_code"]
        country_name = region["country_name"]

        try:
            response = get_country_chart(country_code)
            videos = response.get("items", [])
            raw_charts[country_code] = videos

            for rank, video in enumerate(videos, start=1):
                records.append(
                    create_record(
                        item=video,
                        rank=rank,
                        country_code=country_code,
                        country_name=country_name,
                        category_names=category_names,
                        collected_at=collected_at,
                    )
                )

            print(
                f"[{position:>3}/{len(regions)}] "
                f"{country_name}: {len(videos)} videos"
            )

        except RuntimeError as error:
            failures.append(
                {
                    "country_code": country_code,
                    "country_name": country_name,
                    "error": str(error),
                }
            )

            print(
                f"[{position:>3}/{len(regions)}] "
                f"{country_name}: failed"
            )

        time.sleep(0.05)

    if not records:
        raise RuntimeError("No chart records were collected.")

    dataframe = pd.DataFrame(records)

    country_reach = (
        dataframe.groupby("video_id")["country_code"]
        .nunique()
        .rename("countries_charting")
    )

    dataframe = dataframe.merge(
        country_reach,
        on="video_id",
        how="left",
    )

    dataframe = dataframe.sort_values(
        ["country_name", "rank"],
    )

    summaries = build_country_summaries(dataframe)

    global_trends = (
        dataframe.groupby(
            ["video_id", "title", "channel_name", "category_name"],
            as_index=False,
        )
        .agg(
            countries_charting=("country_code", "nunique"),
            best_rank=("rank", "min"),
            average_rank=("rank", "mean"),
        )
        .sort_values(
            ["countries_charting", "best_rank"],
            ascending=[False, True],
        )
        .head(25)
    )

    raw_output = {
        "generated_at": collected_at,
        "charts": raw_charts,
        "failures": failures,
    }

    processed_output = {
        "generated_at": collected_at,
        "country_count": len(summaries),
        "video_count": int(dataframe["video_id"].nunique()),
        "failed_country_count": len(failures),
        "countries": summaries,
        "global_trends": global_trends.to_dict(orient="records"),
        "failures": failures,
    }

    raw_path = RAW_DIRECTORY / f"youtube_charts_{filename_timestamp}.json"
    csv_path = PROCESSED_DIRECTORY / "latest.csv"
    json_path = PROCESSED_DIRECTORY / "latest.json"

    raw_path.write_text(
        json.dumps(raw_output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    dataframe.to_csv(csv_path, index=False)

    json_path.write_text(
        json.dumps(processed_output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\nCollection complete!")
    print(f"Countries processed: {len(summaries)}")
    print(f"Unique videos: {dataframe['video_id'].nunique()}")
    print(f"Failed countries: {len(failures)}")
    print(f"CSV output: {csv_path}")
    print(f"Website JSON: {json_path}")


if __name__ == "__main__":
    main()