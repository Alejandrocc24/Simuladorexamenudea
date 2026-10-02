import { supabase } from '../lib/supabase';
import { UserProfile } from '../context/AuthContext';

export interface MatchPlayer {
  userId: string;
  displayName: string;
  photoURL?: string;
  score: number;
  answeredCount: number;
  isHost: boolean;
}

export interface MatchRoom {
  id: string;
  code: string;
  status: 'waiting' | 'in_progress' | 'completed';
  hostId: string;
  players: MatchPlayer[];
  maxParticipants: number;
  totalQuestions: number;
  questionIds: string[];
  answersKey?: Record<string, string>;
  answersHashes?: Record<string, string>;
  winnerId?: string;
  createdAt: string;
}

export interface PublicLeaderboardUser {
  id: string;
  displayName: string;
  photoURL?: string;
  rating: number;
  matchesPlayed: number;
  matchesWon: number;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function hashAnswer(questionId: string, answer: string): string {
  let hash = 0;
  const str = `${questionId}#${answer.trim().toUpperCase()}#UdeA_AntiCheat_2026`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(36)}`;
}

type DbEstado = 'esperando' | 'en_curso' | 'finalizada';

function toAppStatus(estado: DbEstado): MatchRoom['status'] {
  if (estado === 'en_curso') return 'in_progress';
  if (estado === 'finalizada') return 'completed';
  return 'waiting';
}

async function buildMatchRoom(roomId: string, answersKey?: Record<string, string>): Promise<MatchRoom> {
  const { data: roomData, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (error || !roomData) throw new Error('La sala ya no existe.');

  const r = roomData as Record<string, unknown>;
  const questionIds = Array.isArray(r['question_ids']) ? (r['question_ids'] as string[]) : [];
  const hostId = String(r['host_id'] ?? '');
  const maxParticipants = typeof r['max_participants'] === 'number' ? (r['max_participants'] as number) : 15;

  const { data: participants } = await supabase
    .from('room_participants')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  const parts = (participants ?? []) as Array<Record<string, unknown>>;

  const { data: answers } = await supabase.from('room_answers').select('user_id').eq('room_id', roomId);
  const ansList = (answers ?? []) as Array<Record<string, unknown>>;
  const answeredByUser = new Map<string, number>();
  for (const a of ansList) {
    const uid = String(a['user_id']);
    answeredByUser.set(uid, (answeredByUser.get(uid) ?? 0) + 1);
  }

  const partIds = parts.map((p) => String(p['user_id']));
  const nameMap = new Map<string, string>();
  if (partIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id,nombre').in('id', partIds);
    for (const p of (profs ?? []) as Array<Record<string, unknown>>) {
      nameMap.set(String(p['id']), String(p['nombre'] ?? ''));
    }
  }

  const players: MatchPlayer[] = parts.map((p) => {
    const userId = String(p['user_id']);
    return {
      userId,
      displayName: nameMap.get(userId) ?? 'Aspirante',
      score: typeof p['puntaje'] === 'number' ? (p['puntaje'] as number) : 0,
      answeredCount: Math.min(answeredByUser.get(userId) ?? 0, questionIds.length),
      isHost: userId === hostId,
    };
  });

  const status = toAppStatus((r['estado'] as DbEstado) ?? 'esperando');

  let winnerId: string | undefined;
  if (status === 'completed') {
    if (players.length < 2) {
      winnerId = 'cancelled';
    } else {
      const sorted = [...players].sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
      const topScore = sorted[0].score;
      const topPlayers = sorted.filter((p) => p.score === topScore);
      winnerId = topPlayers.length > 1 ? 'draw' : sorted[0].userId;
    }
  }

  return {
    id: String(r['id']),
    code: String(r['codigo'] ?? ''),
    status,
    hostId,
    players,
    maxParticipants,
    totalQuestions: questionIds.length,
    questionIds,
    answersKey,
    answersHashes: answersKey
      ? Object.fromEntries(Object.entries(answersKey).map(([k, v]) => [k, hashAnswer(k, v)]))
      : undefined,
    winnerId,
    createdAt: String(r['created_at'] ?? new Date().toISOString()),
  };
}

export async function createMatchRoom(
  hostUser: UserProfile,
  sectionId: string,
  questionIds: string[],
  answersKey?: Record<string, string>
): Promise<MatchRoom> {
  const code = generateRoomCode();
  const { data, error } = await supabase
    .from('rooms')
    .insert({ codigo: code, host_id: hostUser.id, estado: 'esperando', question_ids: questionIds })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'No se pudo crear la sala.');

  const roomId = (data as Record<string, unknown>)['id'] as string;
  const { error: pError } = await supabase
    .from('room_participants')
    .insert({ room_id: roomId, user_id: hostUser.id, puntaje: 0 });
  if (pError) throw new Error(pError.message);

  return buildMatchRoom(roomId, answersKey);
}

export async function joinMatchByCode(code: string, guestUser: UserProfile): Promise<MatchRoom> {
  const cleanCode = code.trim().toUpperCase();
  const { data, error } = await supabase.rpc('join_room', { p_code: cleanCode, p_user_id: guestUser.id });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [data];
  const res = (rows?.[0] ?? {}) as Record<string, unknown>;
  const ok = Boolean(res['ok']);
  const message = String(res['message'] ?? '');
  const roomId = res['room_id'] ? String(res['room_id']) : undefined;

  if (!ok) {
    if (message === 'SALA_LLENA') {
      throw new Error('La sala está llena. Intenta con otra sala.');
    }
    if (message === 'SALA_NO_DISPONIBLE') {
      throw new Error('La sala ya comenzó o finalizó.');
    }
    throw new Error('No se encontró ninguna sala disponible con ese código.');
  }
  if (!roomId) throw new Error('No se pudo unir a la sala.');
  return buildMatchRoom(roomId);
}

export async function startMatch(matchId: string, userId: string): Promise<MatchRoom> {
  const { error } = await supabase.rpc('start_room', { p_room_id: matchId, p_user_id: userId });
  if (error) {
    const raw = (error as { message?: string })?.message ?? '';
    if (raw.includes('MINIMO_2_JUGADORES')) throw new Error('Se necesitan al menos 2 jugadores para iniciar.');
    if (raw.includes('SOLO_HOST')) throw new Error('Solo el anfitrión puede iniciar la partida.');
    throw new Error('No se pudo iniciar la partida.');
  }
  return buildMatchRoom(matchId);
}

export function subscribeToMatch(
  matchId: string,
  onUpdate: (match: MatchRoom) => void,
  onError?: (err: unknown) => void
): () => void {
  let cancelled = false;
  const fetchAndEmit = async () => {
    try {
      const m = await buildMatchRoom(matchId);
      if (!cancelled) onUpdate(m);
    } catch (err) {
      if (!cancelled && onError) onError(err);
    }
  };

  void fetchAndEmit();
  const channel = supabase
    .channel(`room-${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${matchId}` }, fetchAndEmit)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${matchId}` }, fetchAndEmit)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_answers', filter: `room_id=eq.${matchId}` }, fetchAndEmit)
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export async function submitMatchAnswer(
  matchId: string,
  userId: string,
  chosenOptionOrIsCorrect: string | boolean,
  currentQuestionIndex: number,
  totalQuestions: number
) {
  const room = await buildMatchRoom(matchId);
  const questionId = room.questionIds[currentQuestionIndex];
  if (!questionId) return;

  let isCorrect = false;
  if (typeof chosenOptionOrIsCorrect === 'string') {
    const { data } = await supabase.from('questions').select('respuesta_correcta').eq('id', questionId).maybeSingle();
    const official = ((data as Record<string, unknown> | null)?.['respuesta_correcta'] as string | null) ?? null;
    if (official) {
      isCorrect = chosenOptionOrIsCorrect.trim().toUpperCase() === official.trim().toUpperCase();
    } else if (room.answersHashes?.[questionId]) {
      isCorrect = hashAnswer(questionId, chosenOptionOrIsCorrect) === room.answersHashes[questionId];
    }
  } else {
    isCorrect = Boolean(chosenOptionOrIsCorrect);
  }

  await supabase.from('room_answers').insert({
    room_id: matchId,
    question_id: questionId,
    user_id: userId,
    respuesta: typeof chosenOptionOrIsCorrect === 'string' ? chosenOptionOrIsCorrect : null,
    correcta: isCorrect,
  });

  if (isCorrect) {
    const { data: part } = await supabase
      .from('room_participants')
      .select('id,puntaje')
      .eq('room_id', matchId)
      .eq('user_id', userId)
      .maybeSingle();
    const row = part as Record<string, unknown> | null;
    if (row) {
      await supabase
        .from('room_participants')
        .update({ puntaje: (typeof row['puntaje'] === 'number' ? (row['puntaje'] as number) : 0) + 100 })
        .eq('id', String(row['id']));
    }
  }

  const updated = await buildMatchRoom(matchId);
  const allDone = updated.players.length > 0 && updated.players.every((p) => p.answeredCount >= totalQuestions);
  if (allDone && updated.status !== 'completed') {
    await supabase.rpc('finish_room', { p_room_id: matchId });
  }
}

export async function leaveMatch(matchId: string, userId: string) {
  await supabase.rpc('leave_room', { p_room_id: matchId, p_user_id: userId });
}

export async function cleanupStaleMatches() {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from('rooms').update({ estado: 'finalizada' }).eq('estado', 'esperando').lt('created_at', fifteenMinutesAgo);
    // Salas en curso abandonadas (nadie las finalizó): se cierran tras 3h.
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await supabase.from('rooms').update({ estado: 'finalizada' }).eq('estado', 'en_curso').lt('created_at', threeHoursAgo);
  } catch (error) {
    console.warn('cleanupStaleMatches:', error);
  }
}

export async function recordUserMatchResult(_userId: string, _isWinner: boolean, _isDraw: boolean) {
  // profiles no tiene columnas de rating; el ranking se calcula desde room_participants.
}

export function subscribeToLeaderboard(onUpdate: (players: PublicLeaderboardUser[]) => void): () => void {
  let cancelled = false;
  const fetchBoard = async () => {
    try {
      const { data: profs } = await supabase.from('profiles').select('id,nombre').limit(50);
      const { data: parts } = await supabase.from('room_participants').select('user_id,puntaje,room_id');
      const scoreByUser = new Map<string, number>();
      const roomsByUser = new Map<string, Set<string>>();
      for (const p of (parts ?? []) as Array<Record<string, unknown>>) {
        const uid = String(p['user_id']);
        scoreByUser.set(uid, (scoreByUser.get(uid) ?? 0) + (typeof p['puntaje'] === 'number' ? (p['puntaje'] as number) : 0));
        if (!roomsByUser.has(uid)) roomsByUser.set(uid, new Set());
        roomsByUser.get(uid)!.add(String(p['room_id']));
      }
      const list: PublicLeaderboardUser[] = ((profs ?? []) as Array<Record<string, unknown>>)
        .map((pr) => {
          const uid = String(pr['id']);
          return {
            id: uid,
            displayName: String(pr['nombre'] ?? 'Aspirante'),
            rating: 1000 + (scoreByUser.get(uid) ?? 0),
            matchesPlayed: roomsByUser.get(uid)?.size ?? 0,
            matchesWon: 0,
          };
        })
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 20);
      if (!cancelled) onUpdate(list);
    } catch {
      if (!cancelled) onUpdate([]);
    }
  };

  void fetchBoard();
  const channel = supabase
    .channel('leaderboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants' }, fetchBoard)
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}
