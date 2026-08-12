#!/usr/bin/env python3
"""
Simple utility to set a Firebase custom claim 'role' for a user using the
Firebase Admin SDK. Intended for use by platform operators to assign admin
(or other) roles.

Usage:
  python backend/scripts/set_role.py --service-account /path/to/serviceAccount.json --email admin@example.org --role admin
  python backend/scripts/set_role.py --service-account /path/to/serviceAccount.json --uid someUid --role admin

Notes:
- This script requires firebase-admin to be installed (it's listed in backend/requirements.txt).
- After setting a custom claim, the user must refresh their ID token client-side
  (e.g. sign in again or call getIdToken(true)) to pick up the new claims.
"""

import argparse
import sys

import firebase_admin
from firebase_admin import auth, credentials


def ensure_app(service_account_path: str):
    """Initialize firebase app with the given service account if needed."""
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred)


def main():
    parser = argparse.ArgumentParser(description="Set a user's role via Firebase custom claims")
    parser.add_argument("--service-account", required=True, help="Path to Firebase service account JSON file")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--uid", help="UID of the user to update")
    group.add_argument("--email", help="Email address of the user to update")
    parser.add_argument("--role", required=True, choices=["admin", "donor", "social_worker"], help="Role to assign")

    args = parser.parse_args()

    try:
        ensure_app(args.service_account)
    except Exception as exc:
        print(f"Failed to initialize Firebase app: {exc}", file=sys.stderr)
        sys.exit(2)

    try:
        if args.email:
            user = auth.get_user_by_email(args.email)
            uid = user.uid
        else:
            uid = args.uid

        auth.set_custom_user_claims(uid, {"role": args.role})
        print(f"Set role '{args.role}' for user {uid}")
        print("Remember: the user must refresh their ID token (getIdToken(true) on client) to observe the new role.")
    except auth.UserNotFoundError:
        print("User not found.", file=sys.stderr)
        sys.exit(3)
    except Exception as exc:
        print(f"Failed to set custom claims: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
