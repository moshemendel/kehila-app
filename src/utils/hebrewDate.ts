import { JewishDate, HebrewDateFormatter } from 'kosher-zmanim';

const formatter = new HebrewDateFormatter();
formatter.setHebrewFormat(true);

/**
 * Returns the full Hebrew date string, e.g. "ד׳ סיוון תשפ״ו".
 */
export function formatHebrewDate(date: Date): string {
  return formatter.format(new JewishDate(date));
}
