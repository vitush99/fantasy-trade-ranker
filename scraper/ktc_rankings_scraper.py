from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from bs4 import BeautifulSoup
import time, json, re

CHROME_PATH = "/Users/vitushagarwal/Desktop/Google Chrome.app/Contents/MacOS/Google Chrome"
CHROME_DRIVER_PATH = "./chromedriver"

options = webdriver.ChromeOptions()
options.binary_location = CHROME_PATH
options.add_argument("--headless")

def scrape_rankings_all_pages(format_id: int):
    all_players = []

    for page in range(10):
        print(f"Scraping page {page} for format {format_id}...")
        url = f"https://keeptradecut.com/dynasty-rankings?page={page}&filters=QB|WR|RB|TE|RDP&format={format_id}"
        driver = webdriver.Chrome(service=Service(CHROME_DRIVER_PATH), options=options)
        driver.get(url)
        time.sleep(3)

        soup = BeautifulSoup(driver.page_source, "html.parser")
        driver.quit()

        rows = soup.select(".onePlayer")
        for row in rows:
            try:
                rank = int(row.select_one(".rank-number p").get_text(strip=True))
                name = row.select_one(".player-name a").get_text(strip=True)

                # Team may be missing
                team_tag = row.select_one(".player-name .player-team")
                team = team_tag.get_text(strip=True) if team_tag else "N/A"

                # Normalize position (remove trailing numbers)
                raw_position = row.select_one(".position").get_text(strip=True)
                position = re.sub(r'\d+', '', raw_position).strip()

                # Handle missing or invalid age
                age_tag = row.select_one(".age")
                age_text = age_tag.get_text(strip=True) if age_tag else "N/A"
                age = age_text.replace(" y.o.", "").strip()
                if age == "N/A":
                    pass
                else:
                    try:
                        age = float(age)
                    except:
                        age = "N/A"

                value = int(row.select_one(".value p").get_text(strip=True))

                all_players.append({
                    "rank": rank,
                    "name": name,
                    "team": team,
                    "position": position,
                    "age": age,
                    "value": value
                })

            except Exception as e:
                print("Skipped a row:", e)

    return all_players

# Scrape all 10 pages for each format
sf_rankings = scrape_rankings_all_pages(2)
one_qb_rankings = scrape_rankings_all_pages(1)

# Save results
with open("ktc_rankings_sf.json", "w") as f:
    json.dump(sf_rankings, f, indent=2)

with open("ktc_rankings_1qb.json", "w") as f:
    json.dump(one_qb_rankings, f, indent=2)

print(f"\n✅ Saved {len(sf_rankings)} SF players and {len(one_qb_rankings)} 1QB players.")
