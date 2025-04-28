# scrape_and_upload.py

from google.cloud import storage
from ktc_rankings_scraper import get_rankings_data
from ktc_trades_scraper import get_trades_data
import json
import os
from datetime import datetime

# ---- CONFIG ----
BUCKET_NAME = "fantasy-trade-ranker"
UPLOAD_PATHS = {
    "ktc_rankings_sf.json": "ktc_rankings_sf.json",
    "ktc_rankings_1qb.json": "ktc_rankings_1qb.json",
    "ktc_trades.json": "ktc_trades.json",
}
LOCAL_DIR = "temp_data"  # Temp directory for saving files locally

# ---- HELPERS ----

def save_json_locally(data, filename):
    """Save JSON data to the temp_data folder."""
    os.makedirs(LOCAL_DIR, exist_ok=True)
    filepath = os.path.join(LOCAL_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    return filepath

def upload_to_gcs(local_file, target_blob_name):
    """Upload a local file to GCS."""
    client = storage.Client(project="fantasy-trade-ranker")
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(target_blob_name)
    blob.upload_from_filename(local_file)
    print(f"✅ Uploaded {local_file} to gs://{BUCKET_NAME}/{target_blob_name}")

# ---- MAIN PIPELINE ----

def main():
    print(f"\n🚀 Starting scrape and upload at {datetime.now()}\n")

    # Step 1: Scrape fresh rankings and trades
    rankings_sf, rankings_1qb = get_rankings_data()
    new_trades = get_trades_data()

    # Step 2: Save and upload rankings
    print("⬆️ Uploading rankings...")
    rankings_files = {
        "ktc_rankings_sf.json": rankings_sf,
        "ktc_rankings_1qb.json": rankings_1qb,
    }
    for filename, data in rankings_files.items():
        path = save_json_locally(data, filename)
        upload_to_gcs(path, UPLOAD_PATHS[filename])

    # Step 3: Load existing trades from GCS (if they exist)
    print("\n🔄 Merging trades with existing data...")
    client = storage.Client(project="fantasy-trade-ranker")
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob("ktc_trades.json")

    existing_trades = []
    if blob.exists():
        blob_data = blob.download_as_text()
        existing_trades = json.loads(blob_data)

    # Step 4: Merge and deduplicate trades
    trade_strings = set()
    combined_trades = []

    for trade in new_trades + existing_trades:
        trade_str = f"{' + '.join(trade['sideA'])} → {' + '.join(trade['sideB'])}"
        if trade_str not in trade_strings:
            trade_strings.add(trade_str)
            combined_trades.append(trade)

    # Step 5: Sort by timestamp (latest first)
    combined_trades.sort(key=lambda t: t.get("timestamp", ""), reverse=True)

    # Step 6: Limit to 1500 most recent trades
    final_trades = combined_trades[:1500]

    # Step 7: Save and upload final trade list
    final_path = save_json_locally(final_trades, "ktc_trades.json")
    upload_to_gcs(final_path, UPLOAD_PATHS["ktc_trades.json"])

    print("\n🎉 All data scraped, merged, and uploaded!\n")

# ---- ENTRY POINT ----
if __name__ == "__main__":
    main()
