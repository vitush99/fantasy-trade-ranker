# scrape_and_upload.py
from google.cloud import storage
from ktc_rankings_scraper import get_rankings_data
from ktc_trades_scraper import get_trades_data
import json
import os
from datetime import datetime

# ---- CONFIG ---
BUCKET_NAME = "fantasy-trade-ranker"  
UPLOAD_PATHS = {
    "ktc_rankings_sf.json": "ktc_rankings_sf.json",
    "ktc_rankings_1qb.json": "ktc_rankings_1qb.json",
    "ktc_trades.json": "ktc_trades.json",
}
LOCAL_DIR = "temp_data"  # temporary storage before upload

# ---- SCRAPE ----
def save_json_locally(data, filename):
    os.makedirs(LOCAL_DIR, exist_ok=True)
    filepath = os.path.join(LOCAL_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    return filepath

def upload_to_gcs(local_file, target_blob_name):
    credentials_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    client = storage.Client.from_service_account_json(credentials_path)
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(target_blob_name)
    blob.upload_from_filename(local_file)
    print(f"✅ Uploaded {local_file} to gs://{BUCKET_NAME}/{target_blob_name}")



def main():
    print(f"\n🚀 Starting scrape and upload at {datetime.now()}\n")

    # Step 1: Scrape data
    rankings_sf, rankings_1qb = get_rankings_data()
    trades = get_trades_data()

    # Step 2: Save locally
    files = {
        "ktc_rankings_sf.json": rankings_sf,
        "ktc_rankings_1qb.json": rankings_1qb,
        "ktc_trades.json": trades
    }

    for filename, data in files.items():
        local_path = save_json_locally(data, filename)
        upload_to_gcs(local_path, UPLOAD_PATHS[filename])

    print("\n🎉 All data scraped and uploaded!\n")

if __name__ == "__main__":
    main()
