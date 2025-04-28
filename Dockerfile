# Use Python 3.12 base image
FROM python:3.12-slim

# Install system dependencies for Chrome
RUN apt-get update && apt-get install -y \
    wget unzip gnupg curl fonts-liberation libnss3 libxss1 \
    libappindicator3-1 libasound2 libatk-bridge2.0-0 libgtk-3-0 \
    libgbm1 libvulkan1 xdg-utils && \
    rm -rf /var/lib/apt/lists/*

# Install Chrome v122
RUN wget https://storage.googleapis.com/chrome-for-testing-public/122.0.6261.94/linux64/chrome-linux64.zip && \
    unzip chrome-linux64.zip && mv chrome-linux64 /opt/chrome && \
    ln -s /opt/chrome/chrome /usr/bin/google-chrome && \
    rm chrome-linux64.zip

# Install matching ChromeDriver
RUN wget https://storage.googleapis.com/chrome-for-testing-public/122.0.6261.94/linux64/chromedriver-linux64.zip && \
    unzip chromedriver-linux64.zip && \
    mv chromedriver-linux64/chromedriver /usr/local/bin/chromedriver && \
    chmod +x /usr/local/bin/chromedriver && \
    rm -rf chromedriver-linux64*

# Set webdriver-manager path
ENV WDM_BROWSER_PATH=/usr/bin/google-chrome

# Set working directory
WORKDIR /app

# Copy source code
COPY . .

# ✅ Add credentials file to container image
COPY gcs-creds.json /app/gcs-creds.json

# ✅ Set env var inside container (Cloud Run needs this)
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/gcs-creds.json

# Install Python deps
RUN pip install --upgrade pip && pip install -r requirements.txt

# Run scraper
CMD ["python", "scraper/scrape_and_upload.py"]
