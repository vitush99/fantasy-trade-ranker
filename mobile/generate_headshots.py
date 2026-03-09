import requests
import json

# === Config ===
ESPN_HEADSHOT_BASE = "https://a.espncdn.com/i/headshots/nfl/players/full"
ESPN_API_URL = "https://sports.core.api.espn.com/v3/sports/football/nfl/athletes?limit=20000"
KTC_SF_FILE = "assets/data/ktc_rankings_sf.json"
KTC_1QB_FILE = "assets/data/ktc_rankings_1qb.json"
OUTPUT_FILE = "players.json"

# === Step 1: Load KTC Rankings ===
def load_ranked_names(path):
    with open(path, "r") as f:
        players = json.load(f)
    return set(p["name"] for p in players)

print("📥 Loading ranked player names from KTC files...")
sf_names = load_ranked_names(KTC_SF_FILE)
qb_names = load_ranked_names(KTC_1QB_FILE)
all_ranked_names = sf_names.union(qb_names)
print(f"✅ Loaded {len(all_ranked_names)} unique ranked names")

# === Step 2: Fetch ESPN player data ===
print("📡 Fetching player data from ESPN Core API...")
response = requests.get(ESPN_API_URL)
data = response.json()

players_raw = data.get("items", [])
print(f"📦 Total players from ESPN: {len(players_raw)}")

# === Step 3: Filter to only ranked players and build map ===
output = {}

for player in players_raw:
    full_name = player.get("fullName")
    player_id = player.get("id")
    team = player.get("team", {}).get("abbreviation", "")
    position = player.get("position", {}).get("abbreviation", "")

    if not full_name or not player_id:
        continue

    if full_name not in all_ranked_names:
        continue

    output[full_name] = {
        "headshotUrl": f"{ESPN_HEADSHOT_BASE}/{player_id}.png",
        "position": position or "N/A",
        "team": team or "FA"
    }

print(f"✅ Matched {len(output)} ranked players with ESPN headshots")

# === Step 4: Write to players.json ===
with open(OUTPUT_FILE, "w") as f:
    json.dump(output, f, indent=2)

print(f"✅ Done! Saved filtered players to {OUTPUT_FILE}")
