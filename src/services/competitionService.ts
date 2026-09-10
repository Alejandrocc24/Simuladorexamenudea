import { supabase } from '../lib/supabase';
import { UserProfile } from '../context/AuthContext';

export interface MatchRoom {
  id: string;
  code: string;
  status: 'waiting' | 'in_progress' | 'completed';
  sectionId: string;
  hostId: string;
  hostName: string;
  hostPhotoURL?: string;
  guestId?: string;
  guestName?: string;
  guestPhotoURL?: string;
  hostScore: number;
  guestScore: number;
  hostCurrentQuestion: number;
  guestCurrentQuestion: number;
  totalQuestions: number;
  questionIds: string[];
  answersKey?: Record<string, string>;
  answersHashes?: Record<string, string>;
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
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

// Anti-cheat local (compatibilidad): hash simple para no exponer respuestas en memoria
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
  const { data: room, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (error || !room) throw new Error('La sala ya no existe.');

  const r = room as Record<string, unknown>;
  const questionIds = Array.isArray(r['question_ids']) ? (r['question_ids'] as string[]) : [];

  const { data: participants } = await supabase.from('room_participants').select('*').eq('room_id', roomId);
  const parts = (participants ?? []) as Array<Record<string, unknown>>;

  const hostId = String(r['host_id'] ?? '');
  const hostPart = parts.find((p) => String(p['user_id']) === hostId);
  const guestPart = parts.find((p) => String(p['user_id']) !== hostId);

  const { data: answers } = await supabase.from('room_answers').select('user_id,question_id').eq('room_id', roomId);
  const ansList = (answers ?? []) as Array<Record<string, unknown>>;
  const hostAnswered = ansList.filter((a) => String(a['user_id']) === hostId).length;
  const guestAnswered = guestPart ? ansList.filter((a) => String(a['user_id']) === String(guestPart['user_id'])).length : 0;

  const hostScore = typeof hostPart?.['puntaje'] === 'number' ? (hostPart['puntaje'] as number) : 0;
  const guestScore = guestPart && typeof guestPart['puntaje'] === 'number' ? (guestPart['puntaje'] as number) : 0;

  // Nombres desde profiles
  let hostName = 'Anfitrión';
  let guestName: string | undefined;
  const ids = [hostId, guestPart ? String(guestPart['user_id']) : ''].filter(Boolean);
  if (ids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id,nombre').in('id', ids);
    const map = new Map((profs ?? []).map((p: Record<string, unknown>) => [String(p['id']), String(p['nombre'] ?? '')]));
    if (map.get(hostId)) hostName = map.get(hostId)!;
    if (guestPart) guestName = map.get(String(guestPart['user_id'])) ?? 'Rival';
  }

  const status = toAppStatus((r['estado'] as DbEstado) ?? 'esperando');
  let winnerId: string | undefined;
  if (status === 'completed') {
    if (!guestPart) winnerId = 'cancelled';
    else if (hostScore > guestScore) winnerId = hostId;
    else if (guestScore > hostScore) winnerId = String(guestPart['user_id']);
    else winnerId = 'draw';
  }

  return {
    id: String(r['id']),
    code: String(r['codigo'] ?? ''),
    status,
    sectionId: 'all',
    hostId,
    hostName,
    guestId: guestPart ? String(guestPart['user_id']) : undefined,
    guestName,
    hostScore,
    guestScore,
    hostCurrentQuestion: Math.min(hostAnswered, questionIds.length),
    guestCurrentQuestion: Math.min(guestAnswered, questionIds.length),
    totalQuestions: questionIds.length,
    questionIds,
    answersKey,
    answersHashes: answersKey
      ? Object.fromEntries(Object.entries(answersKey).map(([k, v]) => [k, hashAnswer(k, v)]))
      : undefined,
    winnerId,
    createdAt: String(r['created_at'] ?? new Date().toISOString()),
    updatedAt: String(r['created_at'] ?? new Date().toISOString()),
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
  const { data, error } = await supabase
    .from('rooms')
    .select('id,host_id,estado')
    .eq('codigo', cleanCode)
    .eq('estado', 'esperando')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No se encontró ninguna sala disponible con ese código.');

  const row = data as Record<string, unknown>;
  const roomId = String(row['id']);
  if (String(row['host_id']) === guestUser.id) {
    return buildMatchRoom(roomId);
  }

  const { data: existing } = await supabase
    .from('room_participants')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', guestUser.id)
    .maybeSingle();
  if (!existing) {
    const { error: jError } = await supabase
      .from('room_participants')
      .insert({ room_id: roomId, user_id: guestUser.id, puntaje: 0 });
    if (jError) throw new Error('Esta sala ya está ocupada o en curso.');
  }

  await supabase.from('rooms').update({ estado: 'en_curso' }).eq('id', roomId);
  return buildMatchRoom(roomId);
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
  isHost: boolean,
  chosenOptionOrIsCorrect: string | boolean,
  currentQuestionIndex: number,
  totalQuestions: number,
  _currentScore: number
) {
  const room = await buildMatchRoom(matchId);
  const questionId = room.questionIds[currentQuestionIndex];
  if (!questionId) return;

  const userId = isHost ? room.hostId : room.guestId;
  if (!userId) return;

  // Verificación autoritativa contra Supabase (no se confía en el cliente)
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

  // Si ambos terminaron, cerrar la sala
  const updated = await buildMatchRoom(matchId);
  const hostDone = updated.hostCurrentQuestion >= totalQuestions;
  const guestDone = !updated.guestId || updated.guestCurrentQuestion >= totalQuestions;
  if (hostDone && guestDone && updated.status !== 'completed') {
    await supabase.from('rooms').update({ estado: 'finalizada' }).eq('id', matchId);
  }
}

export async function leaveMatch(matchId: string, _userId: string) {
  await supabase.from('rooms').update({ estado: 'finalizada' }).eq('id', matchId);
}

export async function cleanupStaleMatches() {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from('rooms').update({ estado: 'finalizada' }).eq('estado', 'esperando').lt('created_at', fifteenMinutesAgo);
  } catch (error) {
    console.warn('cleanupStaleMatches:', error);
  }
}

export async function finishMatchEarly(matchId: string, _winnerId?: string) {
  await supabase.from('rooms').update({ estado: 'finalizada' }).eq('id', matchId);
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
