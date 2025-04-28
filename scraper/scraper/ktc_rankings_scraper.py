from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import time, re, os, glob

# ✅ Set path for Chrome in Docker
chrome_path = "/opt/chrome/chrome"
os.environ["WDM_BROWSER_PATH"] = chrome_path

# ✅ Set Chrome options
options = Options()
options.binary_location = chrome_path
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")

# ✅ Init driver
driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

def scrape_rankings_all_pages(format_id: int):
    all_players = []

    for page in range(10):
        print(f"Scraping page {page} for format {format_id}...")

        url = f"https://keeptradecut.com/dynasty-rankings?page={page}&filters=QB|WR|RB|TE|RDP&format={format_id}"

        base_path = ChromeDriverManager().install()
        print("📦 Base install path:", base_path)

        # Correct the binary path
        driver_binary = glob.glob(os.path.join(os.path.dirname(base_path), "chromedriver"))[0]
        print("✅ Using chromedriver binary:", driver_binary)

        driver = webdriver.Chrome(service=Service(driver_binary), options=options)
        driver.get(url)
        time.sleep(3)

        soup = BeautifulSoup(driver.page_source, "html.parser")
        driver.quit()

        rows = soup.select(".onePlayer")
        for row in rows:
            try:
                rank = int(row.select_one(".rank-number p").get_text(strip=True))
                name = row.select_one(".player-name a").get_text(strip=True)

                team_tag = row.select_one(".player-name .player-team")
                team = team_tag.get_text(strip=True) if team_tag else "N/A"

                raw_position = row.select_one(".position").get_text(strip=True)
                position = re.sub(r'\d+', '', raw_position).strip()

                age_tag = row.select_one(".age")
                age_text = age_tag.get_text(strip=True) if age_tag else "N/A"
                age = age_text.replace(" y.o.", "").strip()
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

# 🔥 Exported function for scrape_and_upload.py
def get_rankings_data():
    sf_rankings = scrape_rankings_all_pages(2)
    one_qb_rankings = scrape_rankings_all_pages(1)
    return sf_rankings, one_qb_rankings
