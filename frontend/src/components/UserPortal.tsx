import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Mic, MicOff, PhoneOff, Radio } from 'lucide-react';
import { createLocalAudioTrack, LocalAudioTrack, Room, RoomEvent, Track } from 'livekit-client';
import { api } from '../api/client';

const labels: Record<string, string> = {
  inherit: 'Hérité',
  none: 'Aucun accès',
  listen: 'Écoute',
  talk_ptt: 'Push-to-talk',
  duplex: 'Duplex',
  admin: 'Admin salon',
  move: 'Déplacement',
  mute: 'Mute',
  deafen: 'Deafen',
  whisper: 'Whisper'
};

type JoinedRoom = {
  id: string;
  name: string;
  permission: string;
  room: Room;
  audioTrack?: LocalAudioTrack;
  micEnabled: boolean;
  canPublish: boolean;
  participants: string[];
};

export function UserPortal({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [joinedRooms, setJoinedRooms] = useState<JoinedRoom[]>([]);
  const [connectingRoomId, setConnectingRoomId] = useState<string | null>(null);
  const sessionsRef = useRef<Map<string, JoinedRoom>>(new Map());
  const audioHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.get('/portal/me').then((res) => setData(res.data)).catch(() => setError('Impossible de charger le portail utilisateur'));
    return () => {
      for (const session of sessionsRef.current.values()) disconnectSession(session);
      sessionsRef.current.clear();
    };
  }, []);

  const visibleRooms = useMemo(() => data?.rooms.filter((room: any) => room.canEnter) || [], [data]);
  const joinedIds = useMemo(() => new Set(joinedRooms.map((room) => room.id)), [joinedRooms]);
  const openMicCount = joinedRooms.filter((room) => room.micEnabled).length;

  function syncSessions() {
    setJoinedRooms(Array.from(sessionsRef.current.values()));
  }

  function participantNames(lkRoom: Room) {
    return [
      lkRoom.localParticipant.name || lkRoom.localParticipant.identity,
      ...Array.from(lkRoom.remoteParticipants.values()).map((participant) => participant.name || participant.identity)
    ];
  }

  function updateParticipants(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session) return;
    session.participants = participantNames(session.room);
    syncSessions();
  }

  function attachRemoteAudio(roomId: string, track: any) {
    if (track.kind !== Track.Kind.Audio || !audioHostRef.current) return;
    const element = track.attach();
    element.dataset.roomId = roomId;
    element.autoplay = true;
    element.playsInline = true;
    audioHostRef.current.appendChild(element);
    element.play?.().catch(() => undefined);
  }

  function detachRemoteAudio(track: any) {
    track.detach?.().forEach((element: HTMLElement) => element.remove());
  }

  async function joinRoom(room: any) {
    if (sessionsRef.current.has(room.id)) return;
    setConnectingRoomId(room.id);
    setError('');
    try {
      const tokenRes = await api.post(`/portal/rooms/${room.id}/livekit-token`);
      const lkRoom = new Room({ adaptiveStream: true, dynacast: true });

      lkRoom.on(RoomEvent.ParticipantConnected, () => updateParticipants(room.id));
      lkRoom.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room.id));
      lkRoom.on(RoomEvent.TrackSubscribed, (track) => attachRemoteAudio(room.id, track));
      lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => detachRemoteAudio(track));
      lkRoom.on(RoomEvent.Disconnected, () => {
        removeRoomAudioElements(room.id);
        sessionsRef.current.delete(room.id);
        syncSessions();
      });

      await lkRoom.connect(tokenRes.data.url, tokenRes.data.token);

      let audioTrack: LocalAudioTrack | undefined;
      let micEnabled = false;
      if (tokenRes.data.canPublish) {
        audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        });
        await lkRoom.localParticipant.publishTrack(audioTrack);
        micEnabled = true;
      }

      sessionsRef.current.set(room.id, {
        id: room.id,
        name: room.name,
        permission: room.permission,
        room: lkRoom,
        audioTrack,
        micEnabled,
        canPublish: tokenRes.data.canPublish,
        participants: participantNames(lkRoom)
      });
      syncSessions();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Connexion audio impossible');
    } finally {
      setConnectingRoomId(null);
    }
  }

  async function leaveRoom(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session) return;
    disconnectSession(session);
    sessionsRef.current.delete(roomId);
    syncSessions();
  }

  function disconnectSession(session: JoinedRoom) {
    session.audioTrack?.stop();
    session.room.disconnect();
    removeRoomAudioElements(session.id);
  }

  function removeRoomAudioElements(roomId: string) {
    audioHostRef.current?.querySelectorAll(`[data-room-id="${roomId}"]`).forEach((element) => element.remove());
  }

  async function toggleMic(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session?.audioTrack) return;
    const next = !session.micEnabled;
    if (next) {
      await session.audioTrack.unmute();
    } else {
      await session.audioTrack.mute();
    }
    session.micEnabled = next;
    syncSessions();
  }

  if (error && !data) return <main className="portal"><p className="error">{error}</p><button onClick={onLogout}>Retour</button></main>;
  if (!data) return <main className="portal"><p>Chargement...</p></main>;

  return (
    <main className="portal">
      <div ref={audioHostRef} className="audio-host" aria-hidden="true" />
      <header className="portal-header">
        <div className="brand">
          <Radio />
          <div><strong>Remake Intercom</strong><span>{data.user.displayName}</span></div>
        </div>
        <button className="logout" onClick={onLogout}><LogOut size={18} />Déconnexion</button>
      </header>

      <section className="portal-hero">
        <div>
          <h1>Mes salons intercom</h1>
          <p>Audio 100% navigateur. Tu peux rejoindre plusieurs salons et écouter les flux en parallèle.</p>
        </div>
        {joinedRooms.length > 0 && <button className="danger" onClick={() => joinedRooms.forEach((room) => leaveRoom(room.id))}><PhoneOff size={18} />Tout quitter</button>}
      </section>

      {error && <p className="error">{error}</p>}

      <section className="dashboard-grid">
        <div className="metric"><span>Moteur audio</span><strong>LiveKit WebRTC</strong></div>
        <div className="metric"><span>Salons rejoints</span><strong>{joinedRooms.length}</strong></div>
        <div className="metric"><span>Micros ouverts</span><strong>{openMicCount}</strong></div>
        <div className="metric"><span>Rôles</span><strong>{data.user.roles?.map((entry: any) => entry.role.name).join(', ') || data.user.primaryRole?.name || 'Sans rôle'}</strong></div>
      </section>

      {joinedRooms.length > 0 && (
        <section className="joined-stack">
          {joinedRooms.map((session) => (
            <article className="panel live-panel" key={session.id}>
              <div>
                <strong>{session.name}</strong>
                <span>{session.participants.length} participant(s) · {labels[session.permission] || session.permission}</span>
              </div>
              <div className="room-actions">
                <button onClick={() => toggleMic(session.id)} disabled={!session.audioTrack}>{session.micEnabled ? <MicOff size={18} /> : <Mic size={18} />}{session.micEnabled ? 'Couper micro' : 'Activer micro'}</button>
                <button className="danger" onClick={() => leaveRoom(session.id)}><PhoneOff size={18} />Quitter</button>
              </div>
              <div className="participant-list">
                {session.participants.map((participant) => <span key={participant}><i className="dot online" />{participant}</span>)}
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="room-grid">
        {visibleRooms.map((room: any) => (
          <article className="room-card" key={room.id}>
            <header><strong>{room.name}</strong><span>{room.type}</span></header>
            <p className={`permission-pill perm-${room.permission}`}>{labels[room.permission] || room.permission}</p>
            <div className="room-actions">
              <button disabled={connectingRoomId === room.id || joinedIds.has(room.id)} onClick={() => joinRoom(room)}>
                <Mic size={16} />{joinedIds.has(room.id) ? 'Connecté' : connectingRoomId === room.id ? 'Connexion...' : 'Rejoindre'}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
