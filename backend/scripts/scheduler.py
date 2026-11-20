#!/usr/bin/env python3
"""Run the background jobs (backend/app/jobs.py) on a loop, for local
development and small deployments. Uses the same backend/.env as run.py.

    cd backend
    python scripts/scheduler.py              # every 10 minutes
    python scripts/scheduler.py --every 60   # every 60 seconds
    python scripts/scheduler.py --once       # one run, then exit (for cron)

In production you can instead call POST /api/internal/run-jobs from a cron or
cloud scheduler with the X-Internal-Token header (INTERNAL_SCHEDULER_TOKEN).
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(BACKEND, ".env"))

from app import create_app, jobs  # noqa: E402
from app.firebase import get_db  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--every", type=int, default=600, help="seconds between runs")
    parser.add_argument("--once", action="store_true", help="run once and exit")
    args = parser.parse_args()

    app = create_app()
    while True:
        with app.app_context():
            started = datetime.now(timezone.utc)
            results = jobs.run_all(get_db(), started)
        print(f"[{started:%Y-%m-%d %H:%M:%S}Z] {json.dumps(results, default=str)}", flush=True)
        if args.once:
            return
        time.sleep(max(args.every, 10))


if __name__ == "__main__":
    main()
