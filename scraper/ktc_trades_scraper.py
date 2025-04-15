from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
import time
import json
from bs4 import BeautifulSoup
import datetime

# Path to your local Chrome binary
CHROME_PATH = "/Users/vitushagarwal/Desktop/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_DRIVER_PATH = "./chromedriver"

# Setup Selenium
options = webdriver.ChromeOptions()
options.binary_location = CHROME_PATH
options.add_argument("--headless")  # comment this line out to watch the browser
driver = webdriver.Chrome(service=Service(CHROME_DRIVER_PATH), options=options)

# Load the KTC trade database
driver.get("https://keeptradecut.com/dynasty/trade-database")
time.sleep(5)  # Wait for content to load

# Scroll to load more trades (adjust number of scrolls)
for _ in range(3):
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(3)

# Get the full HTML
html = driver.page_source
driver.quit()

# Parse with BeautifulSoup
soup = BeautifulSoup(html, "html.parser")
trade_cards = soup.select(".tdb-trade-wrap")

trades = []

for card in trade_cards:
    try:
        side_a_div = card.select_one(".tdb-wrap-tm-1")
        side_b_div = card.select_one(".tdb-wrap-tm-2")
        settings_div = card.select_one(".tdb-wrap-settings")
        date_div = card.select_one(".tdb-wrap-date")

        side_a = [el.get_text(strip=True) for el in side_a_div.select("a, p")]
        side_b = [el.get_text(strip=True) for el in side_b_div.select("a, p")]
        date_text = date_div.get_text(strip=True) if date_div else str(datetime.date.today())

        # Default settings
        settings = {
            "qb": "1QB",
            "te": "none",
            "teams": None,
            "start": None,
            "passTD": None,
            "ppr": None
        }

        # Parse format (SF/1QB/TE++)
        large_labels = settings_div.select(".league-setting.large-setting")
        for lbl in large_labels:
            text = lbl.get_text(strip=True)
            if "SF" in text:
                settings["qb"] = "SF"
            elif "1QB" in text:
                settings["qb"] = "1QB"
            elif "TE" in text:
                settings["te"] = text

        # Parse league specifics
        other_settings = settings_div.select(".league-setting.other-setting")
        for s in other_settings:
            raw = s.get_text(strip=True)
            if "Teams" in raw:
                settings["teams"] = int(s.select_one("span").text.strip())
            elif "Start" in raw:
                settings["start"] = int(s.select_one("span").text.strip())
            elif "PassTD" in raw:
                val = s.select_one("span").text.strip().replace("pt", "")
                settings["passTD"] = float(val)
            elif "PPR" in raw:
                val = s.text.strip().replace("PPR", "").replace("Tiered", "").strip()
                try:
                    settings["ppr"] = float(val) if val else "Tiered"
                except:
                    settings["ppr"] = "Tiered"

        # Final trade object
        trade = {
            "date": date_text,
            "sideA": side_a,
            "sideB": side_b,
            "settings": settings
        }

        trades.append(trade)

    except Exception as e:
        print("Failed to parse trade:", e)

# Save to file
with open("ktc_trades.json", "w") as f:
    json.dump(trades, f, indent=2)

print(f"✅ Scraped {len(trades)} trades and saved to ktc_trades.json")
