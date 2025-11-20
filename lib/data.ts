export interface Match {
  id: number;
  home: string;
  away: string;
  date: string;
  time: string;
  stadium: string;
  status: 'UPCOMING' | 'LIVE' | 'FINISHED';
  result_home?: number; // Changed from nested object to flat DB columns
  result_away?: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  code: string; // <--- NEW FIELD
}

export const PLAYERS = [
  { id: 'p1', name: 'Özmerç', avatar: '😼', code: '1hj8' },
  { id: 'p2', name: 'Eren', avatar: '🤡', code: 'qw89' },
  { id: 'p3', name: 'Melih', avatar: '🥴', code: 'rt74' },
  { id: 'p4', name: 'Kaan', avatar: '😏', code: 'y674' },
  { id: 'p5', name: 'Memih', avatar: '🤠', code: 'as56' },
  { id: 'p6', name: 'Aziz Cem', avatar: '🫠', code: 'jh67' },
];

export const TEAM_COLORS: Record<string, string> = {
  "Mexico": "linear-gradient(90deg, #006847 33%, #FFFFFF 33%, #FFFFFF 66%, #CE1126 66%)",
  "France": "linear-gradient(90deg, #0055A4 33%, #FFFFFF 33%, #FFFFFF 66%, #EF4135 66%)",
  "USA": "linear-gradient(135deg, #3C3B6E 50%, #B22234 50%)", 
  "Italy": "linear-gradient(90deg, #009246 33%, #FFFFFF 33%, #FFFFFF 66%, #CE2B37 66%)",
  "Canada": "linear-gradient(90deg, #FF0000 33%, #FFFFFF 33%, #FFFFFF 66%, #FF0000 66%)",
  "Brazil": "linear-gradient(135deg, #FFDF00 50%, #009c3b 50%)", 
  "Argentina": "linear-gradient(to bottom, #75AADB 33%, #FFFFFF 33%, #FFFFFF 66%, #75AADB 66%)",
  "Germany": "linear-gradient(to bottom, #000000 33%, #DD0000 33%, #DD0000 66%, #FFCE00 66%)",
  "England": "linear-gradient(90deg, #FFFFFF 45%, #CE1124 45%, #CE1124 55%, #FFFFFF 55%)", 
  "Japan": "radial-gradient(circle, #BC002D 35%, #FFFFFF 36%)",
};