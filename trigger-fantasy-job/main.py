from google.cloud import run_v2

def trigger_job(event, context):
    client = run_v2.JobsClient()
    job_name = "projects/fantasy-trade-ranker/locations/us-central1/jobs/fantasy-scraper"
    client.run_job(name=job_name)
