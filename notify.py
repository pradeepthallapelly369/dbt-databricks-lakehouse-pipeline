import os
import sys
import json
from dotenv import load_dotenv

# Load env variables from current directory (.env)
load_dotenv()

# Add QlikHunter directory to Python path
sys.path.append("/home/upc/every_thing_claude/QlikHunter")

from notifier import notify_all

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 notify.py <jobs_json_file>")
        sys.exit(1)
        
    jobs_file = sys.argv[1]
    if not os.path.exists(jobs_file):
        print(f"Error: jobs file {jobs_file} not found")
        sys.exit(1)
        
    with open(jobs_file, "r") as f:
        jobs = json.load(f)
        
    if not jobs:
        print("No jobs to notify.")
        sys.exit(0)
        
    print(f"Sending notifications for {len(jobs)} jobs...")
    notify_all(jobs)
    print("Notification run complete.")

if __name__ == "__main__":
    main()
