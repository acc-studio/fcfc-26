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

// Map Country Name -> ISO Code for FlagCDN
// Note: England/Scotland use special GB subdivision codes
export const TEAM_ISO: Record<string, string> = {
  // Co-hosts
  "Canada": "ca",
  "Mexico": "mx",
  "USA": "us",
  
  // AFC
  "Australia": "au",
  "IR Iran": "ir",
  "Japan": "jp",
  "Jordan": "jo",
  "Korea Republic": "kr",
  "Qatar": "qa",
  "Saudi Arabia": "sa",
  "Uzbekistan": "uz",
  
  // CAF
  "Algeria": "dz",
  "Cabo Verde": "cv",
  "Côte d'Ivoire": "ci",
  "Egypt": "eg",
  "Ghana": "gh",
  "Morocco": "ma",
  "Senegal": "sn",
  "South Africa": "za",
  "Tunisia": "tn",
  
  // Concacaf
  "Curaçao": "cw",
  "Haiti": "ht",
  "Panama": "pa",
  
  // CONMEBOL
  "Argentina": "ar",
  "Brazil": "br",
  "Colombia": "co",
  "Ecuador": "ec",
  "Paraguay": "py",
  "Uruguay": "uy",
  
  // OFC
  "New Zealand": "nz",
  
  // UEFA
  "Austria": "at",
  "Belgium": "be",
  "Croatia": "hr",
  "England": "gb-eng", // Special code
  "France": "fr",
  "Germany": "de",
  "Netherlands": "nl",
  "Norway": "no",
  "Portugal": "pt",
  "Scotland": "gb-sct", // Special code
  "Spain": "es",
  "Switzerland": "ch",
  
  // Fallbacks
  "Italy": "it",
};