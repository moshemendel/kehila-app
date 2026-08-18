# -*- coding: utf-8 -*-
"""
nav_link.py — יצירת קישורי ניווט ל-Waze ולגוגל מפות
מקבל כתובת ו/או קואורדינטות ומחזיר קישור מוכן לשיתוף.

שימוש משורת הפקודה:
    python nav_link.py "דוד המלך 10, ירושלים"
    python nav_link.py --coords 31.7767,35.2251
    python nav_link.py "דוד המלך 10, ירושלים" --no-navigate
    python nav_link.py "אגריפס 93, ירושלים" --app google

שימוש כמודול:
    from nav_link import waze_link, gmaps_link
    waze_link(address="דוד המלך 10, ירושלים")
    waze_link(lat=31.7767, lng=35.2251)
"""
import argparse
from urllib.parse import quote


def waze_link(address=None, lat=None, lng=None, navigate=True):
    """קישור ניווט ל-Waze. קואורדינטות מנצחות כתובת אם ניתנו שתיהן (מדויק יותר)."""
    base = "https://www.waze.com/ul"
    if lat is not None and lng is not None:
        params = f"ll={lat},{lng}"
    elif address:
        params = f"q={quote(address)}"
    else:
        raise ValueError("צריך לספק כתובת או קואורדינטות (lat+lng)")
    if navigate:
        params += "&navigate=yes"
    return f"{base}?{params}"


def gmaps_link(address=None, lat=None, lng=None):
    """קישור לגוגל מפות (חיפוש מקום). קואורדינטות מנצחות כתובת אם ניתנו שתיהן."""
    base = "https://www.google.com/maps/search/?api=1&query="
    if lat is not None and lng is not None:
        return f"{base}{lat}%2C{lng}"
    if address:
        return f"{base}{quote(address)}"
    raise ValueError("צריך לספק כתובת או קואורדינטות (lat+lng)")


def main():
    p = argparse.ArgumentParser(description="יצירת קישור ניווט ל-Waze / גוגל מפות")
    p.add_argument("address", nargs="?", default=None, help='כתובת, למשל: "דוד המלך 10, ירושלים"')
    p.add_argument("--coords", "-c", default=None, metavar="LAT,LNG",
                   help="קואורדינטות, למשל: 31.7767,35.2251")
    p.add_argument("--app", "-a", choices=["waze", "google", "both"], default="both",
                   help="לאיזו אפליקציה לייצר קישור (ברירת מחדל: שתיהן)")
    p.add_argument("--no-navigate", action="store_true",
                   help="Waze: רק להציג על המפה, בלי להתחיל ניווט")
    args = p.parse_args()

    lat = lng = None
    if args.coords:
        try:
            lat, lng = (float(x.strip()) for x in args.coords.split(","))
        except ValueError:
            p.error("קואורדינטות לא תקינות — הפורמט הוא LAT,LNG למשל 31.7767,35.2251")
    if not args.coords and not args.address:
        p.error("צריך לספק כתובת או קואורדינטות (--coords)")

    if args.app in ("waze", "both"):
        print("Waze:  ", waze_link(args.address, lat, lng, navigate=not args.no_navigate))
    if args.app in ("google", "both"):
        print("Google:", gmaps_link(args.address, lat, lng))


if __name__ == "__main__":
    main()