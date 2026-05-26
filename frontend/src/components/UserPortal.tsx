import { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, LogOut, Mic, MicOff, PhoneOff, Radio, Scan, UserX, Volume2, VolumeX } from 'lucide-react';
import { createLocalAudioTrack, LocalAudioTrack, Room, RoomEvent, Track } from 'livekit-client';
import { api } from '../api/client';

const labels: Record<string, string> = {
  inherit: 'Hérité',
  none: 'Aucun accès',
  listen: 'Écoute',
  talk_ptt: 'Talk (PTT)',
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
  userMuted: boolean;
};

export function UserPortal({
  onLogout,
  endpointBase = '/portal',
  embedded = false,
  title = 'Intercom',
  subtitle = 'Tap room to toggle. Hold for push-to-talk.'
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
  const [soloRoomId, setSoloRoomId] = useState<string | null>(null);
  const sessionsRef = useRef<Map<string, JoinedRoom>>(new Map());
  const remoteAudioRef = useRef<Map<string, RemoteAudioBinding>>(new Map());
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const pressTimersRef = useRef<Map<string, number>>(new Map());
  const momentaryRoomsRef = useRef<Set<string>>(new Set());
  const suppressClickRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    api.get(`${endpointBase}/me`).then((res) => setData(res.data)).catch(() => setError('Impossible de charger le portail intercom'));
    return () => {
      for (const session of Array.from(sessionsRef.current.values())) disconnectSession(session);
      for (const timer of pressTimersRef.current.values()) window.clearTimeout(timer);
      sessionsRef.current.clear();
      pressTimersRef.current.clear();
      momentaryRoomsRef.current.clear();
      suppressClickRef.current.clear();
    };
  }, [endpointBase]);

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
  const joinedById = useMemo(() => new Map(joinedRooms.map((room) => [room.id, room])), [joinedRooms]);
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
    element.volume = 1;
    audioHostRef.current.appendChild(element);
    remoteAudioRef.current.set(identity, { roomId, track, element, volume: 1, userMuted: false });
    applyPlaybackState();
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
        if (sessionsRef.current.has(room.id)) {
          sessionsRef.current.delete(room.id);
          syncSessions();
        }
      });

      await lkRoom.connect(tokenRes.data.url, tokenRes.data.token);

      let audioTrack: LocalAudioTrack | undefined;
      let micEnabled = false;
      const pttMode = room.permission === 'talk_ptt';
      if (tokenRes.data.canPublish) {
        audioTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
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
    sessionsRef.current.delete(roomId);
    syncSessions();
    disconnectSession(session);
  }

  function disconnectSession(session: JoinedRoom) {
    try {
      session.audioTrack?.stop();
      session.room.removeAllListeners();
      session.room.disconnect();
    } catch {
      // Disconnect is best-effort; UI state has already been cleaned.
    }
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
    applyPlaybackState();
    syncSessions();
  }

  function toggleParticipantVolume(participantId: string) {
    const binding = remoteAudioRef.current.get(participantId);
    if (!binding) return;
    binding.userMuted = !binding.userMuted;
    applyPlaybackState();
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
    binding.userMuted = safeVolume === 0;
    applyPlaybackState();
    syncSessions();
  }

  async function muteAllMics() {
    await Promise.all(Array.from(sessionsRef.current.values()).map((session) => setMic(session.id, false)));
  }

  function muteAllSpeakers() {
    for (const session of sessionsRef.current.values()) {
      session.speakerMuted = true;
    }
    applyPlaybackState();
    syncSessions();
  }

  function applyPlaybackState(nextSoloRoomId = soloRoomId) {
    for (const binding of remoteAudioRef.current.values()) {
      const session = sessionsRef.current.get(binding.roomId);
      binding.element.muted = binding.userMuted || Boolean(session?.speakerMuted) || Boolean(nextSoloRoomId && binding.roomId !== nextSoloRoomId);
    }
  }

  function toggleSolo(roomId: string) {
    const next = soloRoomId === roomId ? null : roomId;
    setSoloRoomId(next);
    applyPlaybackState(next);
  }

  function clearSolo() {
    setSoloRoomId(null);
    applyPlaybackState(null);
  }

  function startRoomPress(roomId: string) {
    const session = sessionsRef.current.get(roomId);
    if (!session?.audioTrack) return;
    const timer = window.setTimeout(() => {
      momentaryRoomsRef.current.add(roomId);
      suppressClickRef.current.add(roomId);
      setMic(roomId, true);
    }, 220);
    pressTimersRef.current.set(roomId, timer);
  }

  function endRoomPress(roomId: string) {
    const timer = pressTimersRef.current.get(roomId);
    if (timer) {
      window.clearTimeout(timer);
      pressTimersRef.current.delete(roomId);
    }
    if (momentaryRoomsRef.current.has(roomId)) {
      momentaryRoomsRef.current.delete(roomId);
      setMic(roomId, false);
    }
  }

  function handleRoomClick(room: any) {
    if (suppressClickRef.current.has(room.id)) {
      suppressClickRef.current.delete(room.id);
      return;
    }
    const session = sessionsRef.current.get(room.id);
    if (!session) {
      joinRoom(room);
      return;
    }
    if (momentaryRoomsRef.current.has(room.id)) return;
    if (!session.pttMode) toggleMic(room.id);
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

      <section className="intercom-console-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="console-status">
          <span><i className="dot online" />{joinedRooms.length > 0 ? 'Connected' : 'Ready'}</span>
          <span>{visibleRooms.length} rooms</span>
          <span>{openMicCount} mic(s)</span>
          {soloRoomId && <button className="solo-clear" onClick={clearSolo}>Solo off</button>}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="intercom-board">
        {visibleRooms.map((room: any) => {
          const session = joinedById.get(room.id);
          return (
            <article
              className={`console-room-card ${session ? 'joined' : ''} ${soloRoomId === room.id ? 'soloed' : ''}`}
              key={room.id}
              onPointerDown={() => session && startRoomPress(room.id)}
              onPointerUp={() => session && endRoomPress(room.id)}
              onPointerCancel={() => session && endRoomPress(room.id)}
              onPointerLeave={() => session && endRoomPress(room.id)}
              onClick={() => handleRoomClick(room)}
            >
              <header>
                <div className="room-initial">{initials(room.name).slice(0, 1)}</div>
                <div>
                  <strong>{room.name}</strong>
                  <span>{session ? `${session.participants.length} participant(s)` : '0 participant'} · {room.slug || room.type}</span>
                </div>
                <p className={`permission-chip perm-${room.permission}`}>{labels[room.permission] || room.permission}</p>
              </header>

              <div className="mini-room-actions">
                {session && <>
                  <button className={session.speakerMuted ? 'mini-icon muted' : 'mini-icon'} onClick={(event) => { event.stopPropagation(); toggleSpeaker(session.id); }} title="Mute le son du salon">
                    {session.speakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <button className={soloRoomId === session.id ? 'mini-icon active' : 'mini-icon'} onClick={(event) => { event.stopPropagation(); toggleSolo(session.id); }} title="Solo ce salon">
                    <Scan size={16} />
                  </button>
                  <button className={session.pttMode ? 'mini-icon active' : 'mini-icon'} onClick={(event) => { event.stopPropagation(); togglePtt(session.id); }} disabled={!session.audioTrack} title="Push-to-talk">
                    <Headphones size={16} />
                  </button>
                  <button className="mini-key" onClick={(event) => { event.stopPropagation(); setPttCaptureRoomId(session.id); }} disabled={!session.audioTrack}>
                    {pttCaptureRoomId === session.id ? 'Appuie...' : humanKey(session.pttKey)}
                  </button>
                </>}
              </div>

              {session ? (
                <>
                  <div className="console-participants">
                    {session.participants.map((participant) => {
                      const binding = participant.local ? undefined : remoteAudioRef.current.get(participant.id);
                  const remoteMuted = Boolean(binding?.userMuted);
                      const remoteVolume = Math.round((binding?.volume ?? 1) * 100);
                      const canKick = session.permission === 'admin' && !participant.local;
                      return (
                        <div className={`console-participant ${participant.speaking ? 'speaking' : ''}`} key={participant.id}>
                          <span className="mini-avatar">{initials(participant.name).slice(0, 1)}</span>
                          <div>
                            <strong>{participant.name}{participant.local ? ' (toi)' : ''}</strong>
                            <small>{participant.muted ? 'micro coupé' : participant.local ? 'local' : 'en ligne'}</small>
                          </div>
                          {!participant.local && <div className="compact-volume">
                            <button className={remoteMuted ? 'mini-icon muted' : 'mini-icon'} onClick={(event) => { event.stopPropagation(); toggleParticipantVolume(participant.id); }} title="Mute cet utilisateur">
                              {remoteMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                            </button>
                            <input type="range" min="0" max="100" value={remoteVolume} onClick={(event) => event.stopPropagation()} onChange={(event) => setParticipantVolume(participant.id, Number(event.target.value) / 100)} />
                            <em>{remoteVolume}%</em>
                            {canKick && <button className="mini-kick" onClick={(event) => { event.stopPropagation(); kickParticipant(session.id, participant.id); }} title="Kick du salon"><UserX size={14} /></button>}
                          </div>}
                        </div>
                      );
                    })}
                  </div>

                  <footer>
                    <button onClick={(event) => { event.stopPropagation(); toggleMic(session.id); }} disabled={!session.audioTrack || session.pttMode}>{session.micEnabled ? <MicOff size={16} /> : <Mic size={16} />}{session.micEnabled ? 'Mute' : 'Mic'}</button>
                    <button className="danger" onClick={(event) => { event.stopPropagation(); leaveRoom(session.id); }}><PhoneOff size={16} />Quitter</button>
                  </footer>
                </>
              ) : (
                <div className="empty-room-state">
                  <span>{room.type}</span>
                  <button disabled={connectingRoomId === room.id} onClick={(event) => { event.stopPropagation(); joinRoom(room); }}>
                    <Mic size={16} />{connectingRoomId === room.id ? 'Connexion...' : 'Rejoindre'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {joinedRooms.length > 0 && (
        <div className="intercom-dock">
          <button onClick={muteAllMics}><MicOff size={28} /><span>Mute</span></button>
          <button onClick={muteAllSpeakers}><VolumeX size={28} /><span>Deafen</span></button>
          <button className="danger" onClick={() => Array.from(sessionsRef.current.keys()).forEach((roomId) => leaveRoom(roomId))}><PhoneOff size={28} /><span>Quitter</span></button>
        </div>
      )}
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
