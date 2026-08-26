/**
 * Shared between the resident-facing synagogue page and the gabay's manage
 * screen, so "past" means exactly the same thing in both places — the
 * manage screen's "recycle into the future" edit only works because pushing
 * an announcement's date forward is what makes it reappear on the resident
 * page, and that only holds if both screens test the date the same way.
 *
 * Day granularity, not the instant: an announcement for 20:00 today should
 * not vanish from the page at 20:01 while the event is still happening.
 * Mirrors the convention EventsContext already uses for CommunityEvent.
 */
import { SynagogueAnnouncement } from '../types';

export function isPastAnnouncement(ann: SynagogueAnnouncement): boolean {
  const d = new Date(ann.startDate);
  d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

export function splitAnnouncements(list: SynagogueAnnouncement[]): {
  upcoming: SynagogueAnnouncement[];
  past: SynagogueAnnouncement[];
} {
  const sorted = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return {
    upcoming: sorted.filter((a) => !isPastAnnouncement(a)),
    // Most-recent-first — the one a gabay is likeliest to want to recycle
    // ("we do this every month") is usually the one that just ended.
    past: sorted.filter(isPastAnnouncement).reverse(),
  };
}
