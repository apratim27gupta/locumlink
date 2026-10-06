"""Restore console-owned Stripe/HST env on l2-api-staging from a known-good revision.

Usage:
  python scripts/restore-staging-stripe-from-revision.py [revision]
Default revision: l2-api-staging-00016-56r (last known LIVE).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys

PROJECT = "locumlink-490817"
REGION = "northamerica-northeast1"
SERVICE = "l2-api-staging"
OWNED = (
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "HST_REGISTRATION_NUMBER",
)


def gcloud_bin() -> str:
    found = shutil.which("gcloud.cmd") or shutil.which("gcloud")
    if not found:
        raise SystemExit("gcloud not found on PATH")
    return found


def main() -> None:
    gcloud = gcloud_bin()
    revision = sys.argv[1] if len(sys.argv) > 1 else "l2-api-staging-00016-56r"
    raw = subprocess.check_output(
        [
            gcloud,
            "run",
            "revisions",
            "describe",
            revision,
            f"--project={PROJECT}",
            f"--region={REGION}",
            "--format=json",
        ],
        text=True,
    )
    envs = {
        e["name"]: e["value"]
        for e in json.loads(raw)["spec"]["containers"][0].get("env") or []
        if e.get("value") is not None and e["name"] in OWNED
    }
    missing = [k for k in OWNED if k not in envs]
    if missing:
        raise SystemExit(f"Revision {revision} missing: {missing}")

    sk = envs["STRIPE_SECRET_KEY"]
    if not (sk.startswith("sk_live") or sk.startswith("rk_live")):
        raise SystemExit(f"Refusing: {revision} STRIPE_SECRET_KEY is not live ({sk[:8]}...)")

    paired = ",".join(f"{k}={envs[k]}" for k in OWNED)
    print(f"==> Restoring from {revision}: mode=LIVE prefixes Stripe={sk[:8]}... HST=set")
    subprocess.check_call(
        [
            gcloud,
            "run",
            "services",
            "update",
            SERVICE,
            f"--project={PROJECT}",
            f"--region={REGION}",
            f"--update-env-vars={paired}",
        ]
    )
    cur = subprocess.check_output(
        [
            gcloud,
            "run",
            "services",
            "describe",
            SERVICE,
            f"--project={PROJECT}",
            f"--region={REGION}",
            "--format=json",
        ],
        text=True,
    )
    now = {
        e["name"]: e.get("value", "")
        for e in json.loads(cur)["spec"]["template"]["spec"]["containers"][0].get("env")
        or []
    }
    stripe = now.get("STRIPE_SECRET_KEY", "")
    mode = (
        "LIVE"
        if stripe.startswith(("sk_live", "rk_live"))
        else ("TEST" if stripe.startswith("sk_test") else "OTHER")
    )
    print(f"==> Current {SERVICE}: Stripe={mode} HST={'yes' if now.get('HST_REGISTRATION_NUMBER') else 'no'}")


if __name__ == "__main__":
    main()
