from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import time, re, os, datetime
import glob

os.environ["WDM_BROWSER_PATH"] = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Setup Chrome options
options = webdriver.ChromeOptions()
options.binary_location = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
options.add_argument("--headless")

def get_trades_data():
    install_base = ChromeDriverManager().install()
    driver_dir = os.path.dirname(install_base)

    # ✅ Use glob to find the correct binary in the directory
    driver_binary_list = glob.glob(os.path.join(driver_dir, "chromedriver*"))
    if not driver_binary_list:
        raise FileNotFoundError("No chromedriver binary found.")
    driver_binary = driver_binary_list[0]

    print(f"✅ Using chromedriver binary: {driver_binary}")

    driver = webdriver.Chrome(service=Service(driver_binary), options=options)
    driver.get("https://keeptradecut.com/dynasty/trade-database")
    time.sleep(5)

    for _ in range(3):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(3)

    html = driver.page_source
    driver.quit()

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

            settings = {
                "qb": "1QB",
                "te": "none",
                "teams": None,
                "start": None,
                "passTD": None,
                "ppr": None
            }

            large_labels = settings_div.select(".league-setting.large-setting")
            for lbl in large_labels:
                text = lbl.get_text(strip=True)
                if "SF" in text:
                    settings["qb"] = "SF"
                elif "1QB" in text:
                    settings["qb"] = "1QB"
                elif "TE" in text:
                    settings["te"] = text

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

            trade = {
                "date": date_text,
                "sideA": side_a,
                "sideB": side_b,
                "settings": settings
            }

            trades.append(trade)

        except Exception as e:
            print("Failed to parse trade:", e)

    return trades
