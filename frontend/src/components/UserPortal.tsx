import { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, LogOut, Mic, MicOff, PhoneOff, Radio, UserX, Volume2, VolumeX } from 'lucide-react';
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

type ParticipantView = {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
  local: boolean;
};

type JoinedRoom = {
  id: string;
  name: string;
  permission: string;
  room: Room;
  audioTrack?: LocalAudioTrack;
  micEnabled: boolean;
  canPublish: boolean;
  speakerMuted: boolean;
  pttMode: boolean;
  pttKey: string;
  participants: ParticipantView[];
};

type RemoteAudioBinding = {
  roomId: string;
  track: any;
  element: HTMLMediaElement;
  volume: number;
};

export function UserPortal({
  onLogout,
  endpointBase = '/portal',
  embedded = false,
  title = 'Mes salons intercom',
  subtitle = 'Audio navigateur, push-to-talk configurable, écoute multi-salons et indicateurs de parole.'
}: {
  onLogout?: () => void;
  endpointBase?: string;
  embedded?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [joinedRooms, setJoinedRooms] = useState<JoinedRoom[]>([]);
  const [connectingRoomId, setConnectingRoomId] = useState<string | null>(null);
  const [pttCaptureRoomId, setPttCaptureRoomId] = useState<string | null>(null);
  const sessionsRef = useRef<Map<string, JoinedRoom>>(new Map());
  const remoteAudioRef = useRef<Map<string, RemoteAudioBinding>>(new Map());
  const audioHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.get(`${endpointBase}/me`).then((res) => setData(res.data)).catch(() => setError('Impossible de charger le portail intercom'));
    return () => {
      for (const session of sessionsRef.current.values()) disconnectSession(session);
      sessionsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (pttCaptureRoomId) {
        event.preventDefault();
        const session = sessionsRef.current.get(pttCaptureRoomId);
        if (session) {
          session.pttKey = event.code;
          syncSessions();
        }
        setPttCaptureRoomId(null);
        return;
      }

      for (const session of sessionsRef.current.values()) {
        if (session.pttMode && event.code === session.pttKey && !event.repeat) {
          event.preventDefault();
          setMic(session.id, true);
        }
      }
    }

    function up(event: KeyboardEvent) {
      for (const session of sessionsRef.current.values()) {
        if (session.pttMode && event.code === session.pttKey) {
          event.preventDefault();
          setMic(session.id, false);
        }
      }
    }

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pttCaptureRoomId]);

  const visibleRooms = useMemo(() => data?.rooms.filter((room: any) => room.canEnter) || [], [data]);
  const joinedIds = useMemo(() => new Set(joinedRooms.map((room) => room.id)), [joinedRooms]);
  const openMicCount = joinedRooms.filter((room) => room.micEnabled).length;

  function syncSessions() {
    setJoinedRooms(Array.from(sessionsRef.current.values()).map((session) => ({ ...session, participants: [...session.participants] })));
  }

  function participantViews(lkRoom: Room): ParticipantView[] {
    return [
      {
        id: lkRoom.localParticipant.identity,
        name: lkRoom.localParticipant.name || lkRoom.localParticipant.identity,
        speaking: lkRoom.localParticipant.isSpeaking,
        muted: !Array.from(lkRoom.localParticipant.audioTrackPublications.values()).some((publication) => !publication.isMuted),
        local: true
      },
      ...Array.from(lkRoom.remoteParticipants.values()).map((participant) => ({
        id: participant.identity,
        name: participant.name || participant.identity,
        speaking: participant.isSpeaking,
        muted: !Array.from(participant.audioTrackPublications.values()).some((publication) => !publication.isMuted),
        local: false
      }))
    ];
  }

  function updateParticipants(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session) return;
    session.participants = participantViews(session.room);
    syncSessions();
  }

  function attachRemoteAudio(roomId: string, track: any, participant?: any) {
    if (track.kind !== Track.Kind.Audio || !audioHostRef.current) return;
    const identity = participant?.identity || participant?.sid || `${roomId}:${track.sid}`;
    if (remoteAudioRef.current.has(identity)) return;

    const session = sessionsRef.current.get(roomId);
    const element = track.attach();
    element.dataset.roomId = roomId;
    element.dataset.identity = identity;
    element.autoplay = true;
    element.playsInline = true;
    element.muted = Boolean(session?.speakerMuted);
    element.volume = 1;
    audioHostRef.current.appendChild(element);
    remoteAudioRef.current.set(identity, { roomId, track, element, volume: 1 });
    element.play?.().catch(() => undefined);
  }

  function detachRemoteAudio(track: any, participant?: any) {
    const identity = participant?.identity || participant?.sid;
    if (identity) {
      const binding = remoteAudioRef.current.get(identity);
      if (binding && binding.track === track) {
        binding.track.detach?.().forEach((element: HTMLElement) => element.remove());
        remoteAudioRef.current.delete(identity);
        attachFallbackAudioForParticipant(identity);
        return;
      }
    }

    track.detach?.().forEach((element: HTMLElement) => element.remove());
  }

  function attachFallbackAudioForParticipant(identity: string) {
    for (const session of sessionsRef.current.values()) {
      const participant = session.room.remoteParticipants.get(identity);
      if (!participant) continue;

      for (const publication of participant.trackPublications.values()) {
        const track = publication.track;
        if (track?.kind === Track.Kind.Audio && publication.isSubscribed) {
          attachRemoteAudio(session.id, track, participant);
          return;
        }
      }
    }
  }

  async function joinRoom(room: any) {
    if (sessionsRef.current.has(room.id)) return;
    setConnectingRoomId(room.id);
    setError('');
    try {
      const tokenRes = await api.post(`${endpointBase}/rooms/${room.id}/livekit-token`);
      const lkRoom = new Room({ adaptiveStream: true, dynacast: true });

      lkRoom.on(RoomEvent.ParticipantConnected, () => updateParticipants(room.id));
      lkRoom.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room.id));
      lkRoom.on(RoomEvent.TrackMuted, () => updateParticipants(room.id));
      lkRoom.on(RoomEvent.TrackUnmuted, () => updateParticipants(room.id));
      lkRoom.on(RoomEvent.ActiveSpeakersChanged, () => updateParticipants(room.id));
      lkRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        attachRemoteAudio(room.id, track, participant);
        updateParticipants(room.id);
      });
      lkRoom.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        detachRemoteAudio(track, participant);
        updateParticipants(room.id);
      });
      lkRoom.on(RoomEvent.Disconnected, () => {
        removeRoomAudioElements(room.id);
        sessionsRef.current.delete(room.id);
        syncSessions();
      });

      await lkRoom.connect(tokenRes.data.url, tokenRes.data.token);

      let audioTrack: LocalAudioTrack | undefined;
      let micEnabled = false;
      const pttMode = room.permission === 'talk_ptt';
      if (tokenRes.data.canPublish) {
        audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        });
        await lkRoom.localParticipant.publishTrack(audioTrack);
        micEnabled = !pttMode;
        if (pttMode) await audioTrack.mute();
      }

      sessionsRef.current.set(room.id, {
        id: room.id,
        name: room.name,
        permission: room.permission,
        room: lkRoom,
        audioTrack,
        micEnabled,
        canPublish: tokenRes.data.canPublish,
        speakerMuted: false,
        pttMode,
        pttKey: 'Space',
        participants: participantViews(lkRoom)
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
    for (const [identity, binding] of remoteAudioRef.current.entries()) {
      if (binding.roomId === roomId) {
        remoteAudioRef.current.delete(identity);
        binding.track.detach?.().forEach((element: HTMLElement) => element.remove());
        attachFallbackAudioForParticipant(identity);
      }
    }
  }

  async function setMic(roomId: string, enabled: boolean) {
    const session = sessionsRef.current.get(roomId);
    if (!session?.audioTrack) return;
    enabled ? await session.audioTrack.unmute() : await session.audioTrack.mute();
    session.micEnabled = enabled;
    updateParticipants(roomId);
  }

  async function toggleMic(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session?.audioTrack) return;
    await setMic(roomId, !session.micEnabled);
  }

  async function togglePtt(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session?.audioTrack) return;
    session.pttMode = !session.pttMode;
    if (session.pttMode) await setMic(roomId, false);
    syncSessions();
  }

  function toggleSpeaker(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session) return;
    session.speakerMuted = !session.speakerMuted;
    audioHostRef.current?.querySelectorAll<HTMLMediaElement>(`[data-room-id="${roomId}"]`).forEach((element) => {
      element.muted = session.speakerMuted;
    });
    syncSessions();
  }

  function toggleParticipantVolume(participantId: string) {
    const binding = remoteAudioRef.current.get(participantId);
    if (!binding) return;
    binding.element.muted = !binding.element.muted;
    syncSessions();
  }

  async function kickParticipant(roomId: string, participantId: string) {
    if (!confirm('Kick cet utilisateur du salon ?')) return;
    await api.post(`${endpointBase}/rooms/${roomId}/participants/${encodeURIComponent(participantId)}/kick`);
  }

  function setParticipantVolume(participantId: string, volume: number) {
    const binding = remoteAudioRef.current.get(participantId);
    if (!binding) return;
    const safeVolume = Math.max(0, Math.min(1, volume));
    binding.volume = safeVolume;
    binding.element.volume = safeVolume;
    binding.element.muted = safeVolume === 0;
    syncSessions();
  }

  const Wrapper = embedded ? 'section' : 'main';

  if (error && !data) return <Wrapper className="portal"><p className="error">{error}</p>{onLogout && <button onClick={onLogout}>Retour</button>}</Wrapper>;
  if (!data) return <Wrapper className="portal"><p>Chargement...</p></Wrapper>;

  return (
    <Wrapper className={embedded ? 'portal portal-embedded' : 'portal'}>
      <div ref={audioHostRef} className="audio-host" aria-hidden="true" />
      {!embedded && (
        <header className="portal-header">
          <div className="brand">
            <Radio />
            <div><strong>Remake Intercom</strong><span>{data.user.displayName}</span></div>
          </div>
          {onLogout && <button className="logout" onClick={onLogout}><LogOut size={18} />Déconnexion</button>}
        </header>
      )}

      <section className="portal-hero">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
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
            <article className="panel live-panel intercom-room" key={session.id}>
              <div className="intercom-room-head">
                <div>
                  <strong>{session.name}</strong>
                  <span>{session.participants.length} participant(s) · {labels[session.permission] || session.permission}</span>
                </div>
                <div className="icon-row">
                  <button className={session.speakerMuted ? 'speaker muted' : 'speaker'} onClick={() => toggleSpeaker(session.id)} title="Mute le son du salon">
                    {session.speakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <button className="danger" onClick={() => leaveRoom(session.id)}><PhoneOff size={18} />Quitter</button>
                </div>
              </div>

              <div className="talk-controls">
                <button onClick={() => toggleMic(session.id)} disabled={!session.audioTrack || session.pttMode}>{session.micEnabled ? <MicOff size={18} /> : <Mic size={18} />}{session.micEnabled ? 'Couper micro' : 'Activer micro'}</button>
                <button className={session.pttMode ? 'ptt active' : 'ptt'} onClick={() => togglePtt(session.id)} disabled={!session.audioTrack}><Headphones size={18} />PTT</button>
                <button className="keybind" onClick={() => setPttCaptureRoomId(session.id)} disabled={!session.audioTrack}>
                  {pttCaptureRoomId === session.id ? 'Appuie sur une touche...' : `Touche: ${humanKey(session.pttKey)}`}
                </button>
              </div>

              <div className="participant-grid">
                {session.participants.map((participant) => {
                  const binding = participant.local ? undefined : remoteAudioRef.current.get(participant.id);
                  const remoteMuted = Boolean(binding?.element.muted);
                  const remoteVolume = Math.round((binding?.volume ?? 1) * 100);
                  const canKick = session.permission === 'admin' && !participant.local;
                  return (
                    <div className={`participant-card ${participant.speaking ? 'speaking' : ''}`} key={participant.id}>
                      <div className="participant-avatar">{initials(participant.name)}</div>
                      <div>
                        <strong>{participant.name}</strong>
                        <span>{participant.local ? 'toi' : participant.muted ? 'micro coupé' : 'en ligne'}</span>
                      </div>
                      {!participant.local && <div className="participant-audio-controls">
                        <button className={remoteMuted ? 'speaker muted' : 'speaker'} onClick={() => toggleParticipantVolume(participant.id)} title="Mute cet utilisateur">
                          {remoteMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={remoteVolume}
                          onChange={(event) => setParticipantVolume(participant.id, Number(event.target.value) / 100)}
                          aria-label={`Volume ${participant.name}`}
                        />
                        <em>{remoteVolume}%</em>
                        {canKick && <button className="kick-button" onClick={() => kickParticipant(session.id, participant.id)} title="Kick du salon"><UserX size={16} /></button>}
                      </div>}
                    </div>
                  );
                })}
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
    </Wrapper>
  );
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function humanKey(code: string) {
  if (code === 'Space') return 'Espace';
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}
