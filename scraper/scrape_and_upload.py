# scrape_and_upload.py
import logging
import traceback
import json
import os
from datetime import datetime, timezone

from ktc_rankings_scraper import get_rankings_data
from ktc_trades_scraper import get_trades_data

import firebase_admin  # type: ignore
from firebase_admin import credentials, firestore  # type: ignore

logging.basicConfig(level=logging.INFO)
logging.info("🚀 Scraper container started")

# ---- CONFIG ----
LOCAL_DIR = "temp_data"
FIREBASE_CREDENTIAL_PATH = "firebase-key.json"

# ---- INIT FIREBASE ----
cred = credentials.Certificate(FIREBASE_CREDENTIAL_PATH)
firebase_admin.initialize_app(cred)
fs = firestore.client()

# ---- HELPERS ----
def save_json_locally(data, filename):
    os.makedirs(LOCAL_DIR, exist_ok=True)
    filepath = os.path.join(LOCAL_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    return filepath

# ---- MAIN PIPELINE ----
def main():
    print(f"\n🚀 Starting scrape and upload at {datetime.now()}\n")

    # Step 1: Scrape fresh rankings and trades
    rankings_sf, rankings_1qb = get_rankings_data()
    new_trades = get_trades_data()

    # Step 2: Save rankings to local files
    print("⬆️ Saving rankings locally (optional)...")
    rankings_files = {
        "ktc_rankings_sf.json": rankings_sf,
        "ktc_rankings_1qb.json": rankings_1qb,
    }
    for filename, data in rankings_files.items():
        save_json_locally(data, filename)

    # Step 2.5: Upload rankings to Firestore
    try:
        print("📤 Uploading rankings to Firestore...")
        fs.collection("rankings").document("sf").set({"players": rankings_sf})
        fs.collection("rankings").document("1qb").set({"players": rankings_1qb})
    except Exception as e:
        print("❌ Failed to upload rankings to Firestore:")
        traceback.print_exc()
        print(f"🔥 Exception message: {e}")

    # Step 3: Load existing trades from Firestore
    try:
        print("\n🔄 Merging trades with existing Firestore data...")
        existing_docs = fs.collection("trades").stream()
        existing_trades = [doc.to_dict() for doc in existing_docs]
    except Exception as e:
        print("❌ Failed to read trades from Firestore:")
        traceback.print_exc()
        print(f"🔥 Exception message: {e}")
        existing_trades = []

    # Step 4: Merge and deduplicate trades by unique trade ID
    trade_ids = set()
    combined_trades = []

    for trade in new_trades + existing_trades:
        tid = trade.get("id")
        if tid and tid not in trade_ids:
            trade_ids.add(tid)
            combined_trades.append(trade)

    # Step 5: Sort by optional timestamp
    def get_sortable_timestamp(trade):
        ts = trade.get("timestamp")

        # If it's a string (from scraped trades), parse and make UTC-aware
        if isinstance(ts, str):
            try:
                parsed = datetime.fromisoformat(ts)
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except:
                return datetime.min.replace(tzinfo=timezone.utc)

    # If it's a Firestore timestamp (already aware), just return
        if ts:
            return ts

    # If missing, use a very old UTC-aware datetime
        return datetime.min.replace(tzinfo=timezone.utc)

    combined_trades.sort(key=get_sortable_timestamp, reverse=True)

    # Step 6: Limit to 5000 most recent trades
    final_trades = combined_trades[:5000]

    # Step 7: Upload trades to Firestore
    try:
        print("\n📤 Uploading trades to Firestore...")
        for trade in final_trades:
            trade_id = trade["id"]
            fs.collection("trades").document(trade_id).set(trade)
    except Exception as e:
        print("❌ Failed to upload trades to Firestore:")
        traceback.print_exc()
        print(f"🔥 Exception message: {e}")

    print("\n🎉 All data scraped and uploaded to Firestore!\n")

# ---- ENTRY POINT ----
if __name__ == "__main__":
    main()
