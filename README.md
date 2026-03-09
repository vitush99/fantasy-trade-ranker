
# DynastyCalc

DynastyCalc is a **mobile app for dynasty fantasy football players** that helps users evaluate trades, discover trending deals, and generate **personalized player rankings** based on their own trade preferences.

Instead of relying solely on static expert rankings, DynastyCalc lets users **swipe through real trades** and builds a **custom ranking system** that adapts to each user's valuation of players and picks.

The app combines **crowdsourced trade data, machine learning–inspired ranking adjustments, and real-time user feedback** to create a more personalized dynasty experience.


---

# Key Features

### Trade Swipe Engine
Users evaluate real dynasty trades by swiping on the side they prefer.

Each swipe updates internal player values and builds a personalized ranking system.

---

### Personalized Player Rankings
Player rankings dynamically adjust based on user swipes using a **value-scaled Elo-style algorithm**.

This produces rankings that reflect the **user's actual trade behavior**, not just expert consensus.

---

### Trade Submission & Crowd Feedback
Users can submit their own trades and see:

- Percentage of users choosing each side
- Community sentiment toward their deal
- Real-time voting updates

---

### Trending Trade Feed
The feed surfaces the most active trades across the platform using a **recency-weighted activity signal**.

Trades are ranked by:

- Recent vote activity
- Total engagement

---

### Comment System
Users can discuss trades and debate valuation directly inside the app.

---

### Advanced Trade Filtering
Users can filter trades by league settings including:

- Superflex vs 1QB
- TE Premium level
- Team count
- Starting lineup size
- PPR scoring
- Pass TD scoring

---

# Tech Stack

### Mobile App
- React Native
- TypeScript
- React Native Reanimated
- Expo (initially, later migrated to native workflow)

### Backend / Infrastructure
- Firebase Authentication
- Firestore (real-time database)
- Google Cloud Storage (data hosting)

### Data Pipeline
- Python
- Selenium
- Cloud Run
- Cloud Scheduler

### Data Sources
- KeepTradeCut (rankings + trade database)

---

# System Architecture

```
                KeepTradeCut
                     |
                     v
            Python Scraper (Cloud Run)
                     |
                     v
           Processed JSON Data (GCS)
                     |
                     v
                Mobile App
           (React Native + Firebase)
                     |
         ----------------------------
         |                          |
         v                          v
   Firestore                  User Swipes
   Trades DB               Personalized Values
         |
         v
     Trade Feed
```

---

# Personalized Ranking Algorithm

DynastyCalc uses a **value-scaled Elo-style ranking adjustment**.

Each swipe represents a comparison between two sets of assets.

Algorithm steps:

1. Parse trade into two sides
2. Calculate total value of each side
3. Apply a small value shift (~2–3%)
4. Distribute value changes proportionally across assets
5. Apply exponential decay so **recent swipes matter more**

This produces a continuously evolving **personal value model**.

---

# Data Pipeline

Trade and ranking data are periodically refreshed.

Pipeline steps:

1. Scrape KeepTradeCut rankings and trades
2. Parse trade settings and assets
3. Generate unique trade hash IDs
4. Upload structured JSON to Google Cloud Storage
5. App fetches latest data on launch

Automation uses:

- Google Cloud Run
- Google Cloud Scheduler

---

# Trade Data Model

Example trade:

```json
{
  "tradeId": "hash_id",
  "sideA": ["Ja'Marr Chase"],
  "sideB": ["2026 1st", "Jordan Addison"],
  "settings": {
    "format": "Superflex",
    "tePremium": "TE+",
    "teams": 12,
    "starters": 10,
    "ppr": 1,
    "passTD": 4
  },
  "date": "2025-04-14"
}
```

---

# Local Development

Clone the repo:

```bash
git clone https://github.com/yourname/dynastycalc.git
```

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npx react-native run-ios
```

or

```bash
npx react-native run-android
```

---

# Environment Variables

Create a `.env` file:

```
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

---

# Future Roadmap

Planned improvements:

- Trade value prediction model
- AI trade assistant
- League-specific roster optimization
- Sleeper API integration
- Dynasty portfolio tracking
- Player value trend charts
- Trade simulator

---

# Motivation

Dynasty fantasy football is fundamentally about **player valuation**.

Most tools provide static rankings, but real players constantly adjust values based on trade markets and league context.

DynastyCalc explores a different approach:

> **Let users express their valuations through trades, then learn their preferences algorithmically.**

---

# License

MIT License
