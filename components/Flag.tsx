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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w80/${code}.png`}
      srcSet={`https://flagcdn.com/w160/${code}.png 2x`}
      alt={team}
      className={clsx("object-cover rounded-[2px] border border-white/10", className)}
    />
  );
};
