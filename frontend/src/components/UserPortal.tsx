import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Mic, MicOff, PhoneOff, Radio } from 'lucide-react';
import { createLocalAudioTrack, LocalAudioTrack, Room, RoomEvent } from 'livekit-client';
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

export function UserPortal({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const lkRoomRef = useRef<Room | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);

  useEffect(() => {
    api.get('/portal/me').then((res) => setData(res.data)).catch(() => setError('Impossible de charger le portail utilisateur'));
    return () => {
      audioTrackRef.current?.stop();
      lkRoomRef.current?.disconnect();
    };
  }, []);

  const visibleRooms = useMemo(() => data?.rooms.filter((room: any) => room.canEnter) || [], [data]);

  async function joinRoom(room: any) {
    setConnecting(true);
    setError('');
    try {
      await leaveRoom();
      const tokenRes = await api.post(`/portal/rooms/${room.id}/livekit-token`);
      const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
      const refreshParticipants = () => setParticipants([
        lkRoom.localParticipant.name || lkRoom.localParticipant.identity,
        ...Array.from(lkRoom.remoteParticipants.values()).map((participant) => participant.name || participant.identity)
      ]);

      lkRoom.on(RoomEvent.ParticipantConnected, refreshParticipants);
      lkRoom.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
      lkRoom.on(RoomEvent.Disconnected, () => setParticipants([]));
      await lkRoom.connect(tokenRes.data.url, tokenRes.data.token);

      if (tokenRes.data.canPublish) {
        const track = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        });
        await lkRoom.localParticipant.publishTrack(track);
        audioTrackRef.current = track;
        setMicEnabled(true);
      } else {
        setMicEnabled(false);
      }

      lkRoomRef.current = lkRoom;
      setActiveRoom(room);
      refreshParticipants();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Connexion audio impossible');
    } finally {
      setConnecting(false);
    }
  }

  async function leaveRoom() {
    audioTrackRef.current?.stop();
    audioTrackRef.current = null;
    lkRoomRef.current?.disconnect();
    lkRoomRef.current = null;
    setActiveRoom(null);
    setParticipants([]);
    setMicEnabled(false);
  }

  async function toggleMic() {
    if (!audioTrackRef.current) return;
    const next = !micEnabled;
    if (next) {
      await audioTrackRef.current.unmute();
    } else {
      await audioTrackRef.current.mute();
    }
    setMicEnabled(next);
  }

  if (error && !data) return <main className="portal"><p className="error">{error}</p><button onClick={onLogout}>Retour</button></main>;
  if (!data) return <main className="portal"><p>Chargement...</p></main>;

  return (
    <main className="portal">
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
          <p>Audio 100% navigateur. Choisis un salon autorisé et ton micro sera connecté directement dans l’interface.</p>
        </div>
        {activeRoom && <button className="danger" onClick={leaveRoom}><PhoneOff size={18} />Quitter {activeRoom.name}</button>}
      </section>

      {error && <p className="error">{error}</p>}

      <section className="dashboard-grid">
        <div className="metric"><span>Moteur audio</span><strong>LiveKit WebRTC</strong></div>
        <div className="metric"><span>Salon actif</span><strong>{activeRoom?.name || 'Aucun'}</strong></div>
        <div className="metric"><span>Micro</span><strong>{micEnabled ? 'Ouvert' : 'Fermé / écoute seule'}</strong></div>
        <div className="metric"><span>Rôles</span><strong>{data.user.roles?.map((entry: any) => entry.role.name).join(', ') || data.user.primaryRole?.name || 'Sans rôle'}</strong></div>
      </section>

      {activeRoom && (
        <section className="panel live-panel">
          <div>
            <strong>{activeRoom.name}</strong>
            <span>{participants.length} participant(s)</span>
          </div>
          <button onClick={toggleMic} disabled={!audioTrackRef.current}>{micEnabled ? <MicOff size={18} /> : <Mic size={18} />}{micEnabled ? 'Couper micro' : 'Activer micro'}</button>
          <div className="participant-list">
            {participants.map((participant) => <span key={participant}><i className="dot online" />{participant}</span>)}
          </div>
        </section>
      )}

      <section className="room-grid">
        {visibleRooms.map((room: any) => (
          <article className="room-card" key={room.id}>
            <header><strong>{room.name}</strong><span>{room.type}</span></header>
            <p className={`permission-pill perm-${room.permission}`}>{labels[room.permission] || room.permission}</p>
            <div className="room-actions">
              <button disabled={connecting || activeRoom?.id === room.id} onClick={() => joinRoom(room)}>
                <Mic size={16} />{activeRoom?.id === room.id ? 'Connecté' : 'Rejoindre'}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
