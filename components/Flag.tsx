import { clsx } from 'clsx';
import { TEAM_ISO } from '@/lib/data';

// Small flag image from a country name via FlagCDN; falls back to a "?" swatch
// for unmapped names (e.g. non-WC opponents in a team's recent form).
export const Flag = ({ team, className }: { team: string; className?: string }) => {
  const code = TEAM_ISO[team];
  if (!code) {
    return <span className={clsx("inline-flex items-center justify-center bg-gray-700 rounded-sm text-[8px]", className)}>?</span>;
  }
  return (
    // High-res raster flags — w320 (w640 @2x) so they stay crisp even scaled up
    // into the radial bracket's bigger circular chips.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w640/${code}.png`}
      srcSet={`https://flagcdn.com/w1280/${code}.png 2x`}
      alt={team}
      className={clsx("object-cover rounded-[2px] border border-paper/10", className)}
    />
  );
};
