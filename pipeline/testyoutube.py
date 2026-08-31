import os
from pathlib import Path

import requests
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

api_key = os.getenv("YOUTUBE_API_KEY")

if not api_key:
    raise RuntimeError("YOUTUBE_API_KEY was not found in the .env file.")

endpoint = "https://www.googleapis.com/youtube/v3/videos"

parameters = {
    "part": "snippet,statistics",
    "chart": "mostPopular",
    "regionCode": "CA",
    "maxResults": 10,
    "key": api_key,
}

try:
    response = requests.get(endpoint, params=parameters, timeout=30)
    response_data = response.json()
except requests.RequestException as error:
    raise RuntimeError(f"Could not connect to YouTube: {error}") from error

if response.status_code != 200:
    message = response_data.get("error", {}).get(
        "message",
        "YouTube returned an unknown error.",
    )
    raise RuntimeError(message)

videos = response_data.get("items", [])

print(f"\nCanada chart snapshot: {len(videos)} videos\n")

for rank, video in enumerate(videos, start=1):
    snippet = video["snippet"]
    statistics = video.get("statistics", {})

    title = snippet["title"]
    channel = snippet["channelTitle"]
    category_id = snippet["categoryId"]
    views = int(statistics.get("viewCount", 0))

    print(
        f"{rank:>2}. {title}\n"
        f"    Channel: {channel}\n"
        f"    Category ID: {category_id}\n"
        f"    Global views: {views:,}\n"
    )