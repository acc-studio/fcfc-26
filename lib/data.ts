export interface Match {
  id: number;
  home: string;
  away: string;
  date: string;
  time: string;
  stadium: string;
  status: 'UPCOMING' | 'LIVE' | 'FINISHED';
  result_home?: number;
  result_away?: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  code: string;
}

// Your Custom Players (PRESERVED)
export const PLAYERS = [
  { id: 'p1', name: 'Özmerç', avatar: '😼', code: '1hj8' },
  { id: 'p2', name: 'Eren', avatar: '🤡', code: 'qw89' },
  { id: 'p3', name: 'Melih', avatar: '🥴', code: 'rt74' },
  { id: 'p4', name: 'Kaan', avatar: '😏', code: 'y674' },
  { id: 'p5', name: 'Memih', avatar: '🤠', code: 'as56' },
  { id: 'p6', name: 'Aziz Cem', avatar: '🫠', code: 'jh67' },
];

// Qualified Teams for 2026 (Flat Emojis)
export const TEAM_FLAGS: Record<string, string> = {
  // Co-hosts
  "Canada": "🇨🇦",
  "Mexico": "🇲🇽",
  "USA": "🇺🇸",
  
  // AFC
  "Australia": "🇦🇺",
  "IR Iran": "🇮🇷",
  "Japan": "🇯🇵",
  "Jordan": "🇯🇴",
  "Korea Republic": "🇰🇷",
  "Qatar": "🇶🇦",
  "Saudi Arabia": "🇸🇦",
  "Uzbekistan": "🇺🇿",
  
  // CAF
  "Algeria": "🇩🇿",
  "Cabo Verde": "🇨🇻",
  "Côte d'Ivoire": "🇨🇮",
  "Egypt": "🇪🇬",
  "Ghana": "🇬🇭",
  "Morocco": "🇲🇦",
  "Senegal": "🇸🇳",
  "South Africa": "🇿🇦",
  "Tunisia": "🇹🇳",
  
  // Concacaf
  "Curaçao": "🇨🇼",
  "Haiti": "🇭🇹",
  "Panama": "🇵🇦",
  
  // CONMEBOL
  "Argentina": "🇦🇷",
  "Brazil": "🇧🇷",
  "Colombia": "🇨🇴",
  "Ecuador": "🇪🇨",
  "Paraguay": "🇵🇾",
  "Uruguay": "🇺🇾",
  
  // OFC
  "New Zealand": "🇳🇿",
  
  // UEFA
  "Austria": "🇦🇹",
  "Belgium": "🇧🇪",
  "Croatia": "🇭🇷",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "France": "🇫🇷",
  "Germany": "🇩🇪",
  "Netherlands": "🇳🇱",
  "Norway": "🇳🇴",
  "Portugal": "🇵🇹",
  "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Spain": "🇪🇸",
  "Switzerland": "🇨🇭",
  
  // Legacy / Fallbacks (Just in case you have old test data in DB)
  "Italy": "🇮🇹",
};