"""Download public ancillary geospatial data covering geolocated BDG2 sites.

Usage:
  python research/models/energy/download_ancillary_data.py "C:/path/to/bdg2-full/data/metadata/metadata.csv"

Downloads are stored in data/raw/{land_cover,terrain,population,urban}.
The downloads are source rasters/extracts, not yet joined to training rows.
"""

from __future__ import annotations

import csv
import math
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw"
TIMEOUT = 90


def read_sites(metadata_path: Path) -> list[tuple[float, float]]:
    sites: set[tuple[float, float]] = set()
    with metadata_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            try:
                lat, lon = float(row["lat"]), float(row["lng"])
            except (KeyError, TypeError, ValueError):
                continue
            if math.isfinite(lat) and math.isfinite(lon):
                sites.add((lat, lon))
    if not sites:
        raise RuntimeError(f"No usable lat/lng coordinates in {metadata_path}")
    return sorted(sites)


def worldcover_tile(lat: float, lon: float) -> str:
    south = math.floor(lat / 3) * 3
    west = math.floor(lon / 3) * 3
    lat_tag = f"N{south:02d}" if south >= 0 else f"S{abs(south):02d}"
    lon_tag = f"E{west:03d}" if west >= 0 else f"W{abs(west):03d}"
    return lat_tag + lon_tag


def dem_tile(lat: float, lon: float) -> tuple[str, str]:
    south, west = math.floor(lat), math.floor(lon)
    lat_tag = f"N{south:02d}" if south >= 0 else f"S{abs(south):02d}"
    lon_tag = f"E{abs(west):03d}" if west >= 0 else f"W{abs(west):03d}"
    stem = f"Copernicus_DSM_COG_10_{lat_tag}_00_{lon_tag}_00_DEM"
    return stem, f"https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/{stem}/{stem}.tif"


def head_size(url: str) -> int | None:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "EcoBuildAI-data-downloader/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            length = response.headers.get("Content-Length")
            return int(length) if length else None
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def download(url: str, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    expected = head_size(url)
    if expected is None:
        return f"MISSING source: {url}"
    if destination.exists() and destination.stat().st_size == expected:
        return f"SKIP already complete: {destination.name} ({expected / 1e6:.1f} MB)"
    partial = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "EcoBuildAI-data-downloader/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response, partial.open("wb") as output:
            while True:
                block = response.read(8 * 1024 * 1024)
                if not block:
                    break
                output.write(block)
        actual = partial.stat().st_size
        if expected is not None and actual != expected:
            return f"INCOMPLETE {destination.name}: got {actual}, expected {expected}; kept .part"
        partial.replace(destination)
        return f"DOWNLOADED {destination.name} ({actual / 1e6:.1f} MB)"
    except Exception:
        if partial.exists() and partial.stat().st_size == 0:
            partial.unlink()
        raise


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    metadata = Path(sys.argv[1]).expanduser().resolve()
    if not metadata.is_file():
        raise FileNotFoundError(f"BDG2 metadata not found: {metadata}")

    sites = read_sites(metadata)
    countries = {
        "USA": "https://download.geofabrik.de/north-america/us-latest.osm.pbf",
        "CAN": "https://download.geofabrik.de/north-america/canada-latest.osm.pbf",
        "GBR": "https://download.geofabrik.de/europe/great-britain-latest.osm.pbf",
        "NLD": "https://download.geofabrik.de/europe/netherlands-latest.osm.pbf",
    }

    tasks: list[tuple[str, Path]] = []
    wc_tiles = sorted({worldcover_tile(lat, lon) for lat, lon in sites})
    for tile in wc_tiles:
        filename = f"ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
        url = f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/{filename}"
        tasks.append((url, RAW / "land_cover" / "worldcover_2021_v200" / filename))

    dem_tiles = {dem_tile(lat, lon) for lat, lon in sites}
    for stem, url in sorted(dem_tiles):
        tasks.append((url, RAW / "terrain" / "copernicus_dem_glo30" / f"{stem}.tif"))

    filename = "global_pop_2017_CN_1km_R2025A_v1.tif"
    url = (
        "https://worldpop-public-data.soton.ac.uk/GIS/Population/"
        "Global_2015_2030/R2025A/2017/0_Mosaicked/v1/1km/constrained/"
        f"{filename}"
    )
    tasks.append((url, RAW / "population" / "worldpop_global2_2017_1km" / filename))

    for iso, url in countries.items():
        filename = url.rsplit("/", 1)[-1]
        tasks.append((url, RAW / "urban" / "openstreetmap_geofabrik" / filename))

    print(f"BDG2 coordinate locations: {len(sites)}")
    print(f"WorldCover tiles: {len(wc_tiles)}; Copernicus DEM tiles: {len(dem_tiles)}")
    print("WorldPop global population raster: 2017, 1 km, constrained")
    print("OpenStreetMap extracts: USA, Canada, Great Britain, Netherlands (current snapshot)")
    print(f"Download tasks: {len(tasks)}. Existing complete files will be skipped.", flush=True)

    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(download, url, dest): (url, dest) for url, dest in tasks}
        for future in as_completed(futures):
            url, destination = futures[future]
            try:
                message = future.result()
                print(message, flush=True)
                if message.startswith(("MISSING", "INCOMPLETE")):
                    failures.append(message)
            except Exception as exc:
                message = f"FAILED {destination.name}: {exc} ({url})"
                failures.append(message)
                print(message, flush=True)

    print(f"Finished with {len(failures)} missing/failed downloads.")
    print(f"Output root: {RAW}")
    if failures:
        return 1
    print("ERA5 was not downloaded: the CDS account must accept its dataset terms and provide an API token.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
