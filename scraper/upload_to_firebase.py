import firebase_admin
from firebase_admin import credentials, storage
from pathlib import Path

# Get project root (assumes this script is inside /scraper)
ROOT_DIR = Path(__file__).resolve().parents[1]

# Set up paths
CRED_PATH = ROOT_DIR / "scraper/firebase_creds.json"
TRADES_PATH = ROOT_DIR / "mobile/assets/data/ktc_trades.json"
RANKINGS_SF_PATH = ROOT_DIR / "mobile/assets/data/ktc_rankings_sf.json"
RANKINGS_1QB_PATH = ROOT_DIR / "mobile/assets/data/ktc_rankings_1qb.json"

# Initialize Firebase Admin
cred = credentials.Certificate(CRED_PATH)
firebase_admin.initialize_app(cred, {
    'storageBucket': 'fantasy-trade-ranker'  


# Upload helper
def upload_file(local_path, remote_path):
    bucket = storage.bucket()
    print("🪣 Uploading to bucket:", bucket.name)
    blob = bucket.blob(remote_path)
    blob.upload_from_filename(local_path)
    print(f"✅ Uploaded {local_path} to {remote_path}")

# Upload files
upload_file(str(TRADES_PATH), "ktc_data/ktc_trades.json")
upload_file(str(RANKINGS_SF_PATH), "ktc_data/ktc_rankings_sf.json")
upload_file(str(RANKINGS_1QB_PATH), "ktc_data/ktc_rankings_1qb.json")
