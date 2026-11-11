/**
 * A timestamp in the viewer's locale and timezone. The server renders it in its
 * own, so the text can differ on hydration; that's expected and suppressed here.
 */
export function LocalTime({ iso, dateOnly }: { iso: string; dateOnly?: boolean }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {dateOnly ? d.toLocaleDateString() : d.toLocaleString()}
    </time>
  );
}
