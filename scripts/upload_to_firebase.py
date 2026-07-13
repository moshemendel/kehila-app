"""
upload_to_firebase.py
---------------------
Reads the JSON files produced by excel_to_firebase.py and batch-writes
them to Firestore using the Firebase Admin SDK.

Setup:
    1. Download your service account key from Firebase Console →
       Project Settings → Service Accounts → Generate new private key
    2. Save it as  scripts/serviceAccountKey.json
    3. pip install firebase-admin
    4. python scripts/upload_to_firebase.py [--dir firebase_import]

Each document is upserted (set with merge=False so it overwrites cleanly).
"""

import json
import sys
import argparse
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("Run:  pip install firebase-admin")

COLLECTION_MAP = {
    "synagogues.json":  "synagogues",
    "restaurants.json": "restaurants",
    "mikveh.json":      "mikveh",
    "events.json":      "events",
}


def main():
    ap = argparse.ArgumentParser(description="Upload Firebase import JSON to Firestore")
    ap.add_argument("--dir",     default="firebase_import",      help="Folder with JSON files")
    ap.add_argument("--cred",    default="scripts/serviceAccountKey.json",
                    help="Path to Firebase service account JSON")
    ap.add_argument("--dry-run", action="store_true", help="Print records without uploading")
    args = ap.parse_args()

    cred_path = Path(args.cred)
    if not cred_path.exists():
        sys.exit(
            f"Service account key not found at {cred_path}\n"
            "Download it from Firebase Console → Project Settings → Service Accounts"
        )

    if not args.dry_run:
        cred = credentials.Certificate(str(cred_path))
        firebase_admin.initialize_app(cred)
        db = firestore.client()

    in_dir = Path(args.dir)
    total = 0

    for fname, collection in COLLECTION_MAP.items():
        p = in_dir / fname
        if not p.exists():
            print(f"  [skip] {fname} not found")
            continue

        records = json.loads(p.read_text(encoding="utf-8"))
        print(f"\n{collection}: {len(records)} documents")

        for rec in records:
            doc_id = rec.get("id")
            if not doc_id:
                print(f"  [warn] record without id, skipping: {rec}")
                continue

            if args.dry_run:
                print(f"  [dry] {collection}/{doc_id}")
            else:
                db.collection(collection).document(doc_id).set(rec)
                print(f"  ✓ {collection}/{doc_id}")
            total += 1

    print(f"\n{'[dry-run] Would upload' if args.dry_run else 'Uploaded'} {total} documents total.")


if __name__ == "__main__":
    main()
