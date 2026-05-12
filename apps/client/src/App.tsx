import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

type Peer = {
  id: string;
  userName: string;
};

type RemoteVideo = Peer & {
  stream: MediaStream;
};

type SignalMessage = RTCSessionDescriptionInit | RTCIceCandidateInit;

const signalingUrl = import.meta.env.VITE_SIGNALING_URL ?? 'http://127.0.0.1:3001';

const rtcConfig: RTCConfiguration = {
  // STUN помогает браузеру найти сетевой маршрут для прямого WebRTC-соединения.
  // В production часто добавляют TURN, чтобы соединения работали за сложным NAT.
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function App() {
  const [roomInput, setRoomInput] = useState('demo-room');
  const [nameInput, setNameInput] = useState('');
  const [roomId, setRoomId] = useState<string>();
  const [status, setStatus] = useState('Готово к подключению.');
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());

  useEffect(() => {
    const socket = io(signalingUrl);
    socketRef.current = socket;

    socket.on('room-joined', async ({ peers }: { peers: Peer[] }) => {
      setStatus(`В комнате ${roomIdRef.current}. Участников: ${peers.length + 1}.`);

      // Новый участник инициирует offer для всех, кто уже был в комнате.
      for (const peer of peers) {
        const connection = createPeerConnection(peer.id, peer.userName);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        sendSignal(peer.id, offer);
      }
    });

    socket.on('peer-joined', ({ peer }: { peer: Peer }) => {
      setStatus(`${peer.userName} присоединился.`);
    });

    socket.on('peer-left', ({ peerId }: { peerId: string }) => {
      removePeer(peerId);
      setStatus('Участник покинул комнату.');
    });

    socket.on(
      'signal',
      async ({ fromId, signal }: { fromId: string; signal: SignalMessage }) => {
        let connection = peerConnectionsRef.current.get(fromId);

        if (!connection) {
          // Если первым пришел offer от нового участника, создаем соединение лениво.
          connection = createPeerConnection(fromId);
        }

        if ('type' in signal && signal.type === 'offer') {
          await connection.setRemoteDescription(signal);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          sendSignal(fromId, answer);
          return;
        }

        if ('type' in signal && signal.type === 'answer') {
          await connection.setRemoteDescription(signal);
          return;
        }

        if ('candidate' in signal && signal.candidate) {
          // ICE-кандидаты описывают возможные сетевые маршруты до peer.
          await connection.addIceCandidate(signal);
        }
      },
    );

    socket.on('room-error', ({ message }: { message: string }) => {
      setStatus(message);
    });

    return () => {
      socket.disconnect();
      cleanupRoom();
    };
  }, []);

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextRoomId = roomInput.trim();
    if (!nextRoomId) {
      setStatus('Введите название комнаты.');
      return;
    }

    try {
      await ensureLocalStream();
      setRoomId(nextRoomId);
      roomIdRef.current = nextRoomId;

      // Signaling-сервер знает только участников комнат и пересылает SDP/ICE.
      socketRef.current?.emit('join-room', {
        roomId: nextRoomId,
        userName: nameInput.trim(),
      });
      setStatus(`Подключение к комнате ${nextRoomId}...`);
    } catch (error) {
      setStatus(`Не удалось получить камеру/микрофон: ${(error as Error).message}`);
    }
  }

  function handleLeave() {
    socketRef.current?.emit('leave-room');
    cleanupRoom();
    setStatus('Вы вышли из комнаты.');
  }

  async function ensureLocalStream() {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    // Браузер покажет системный запрос на доступ к камере и микрофону.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    return stream;
  }

  function createPeerConnection(peerId: string, userName = peerId.slice(0, 6)) {
    const existingConnection = peerConnectionsRef.current.get(peerId);

    if (existingConnection) {
      return existingConnection;
    }

    const connection = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current.set(peerId, connection);

    const localStream = localStreamRef.current;
    if (localStream) {
      for (const track of localStream.getTracks()) {
        connection.addTrack(track, localStream);
      }
    }

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerId, event.candidate.toJSON());
      }
    };

    connection.ontrack = (event) => {
      // Когда удаленный peer добавляет media track, браузер передает MediaStream.
      upsertRemoteVideo(peerId, userName, event.streams[0]);
    };

    connection.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(connection.connectionState)) {
        removePeer(peerId);
      }
    };

    return connection;
  }

  function sendSignal(targetId: string, signal: SignalMessage) {
    socketRef.current?.emit('signal', {
      roomId: roomIdRef.current,
      targetId,
      signal,
    });
  }

  function upsertRemoteVideo(peerId: string, userName: string, stream: MediaStream) {
    setRemoteVideos((currentVideos) => {
      const existingVideo = currentVideos.find((video) => video.id === peerId);

      if (existingVideo) {
        return currentVideos.map((video) =>
          video.id === peerId ? { ...video, userName, stream } : video,
        );
      }

      return [...currentVideos, { id: peerId, userName, stream }];
    });
  }

  function removePeer(peerId: string) {
    const connection = peerConnectionsRef.current.get(peerId);
    connection?.close();
    peerConnectionsRef.current.delete(peerId);
    setRemoteVideos((currentVideos) => currentVideos.filter((video) => video.id !== peerId));
  }

  function cleanupRoom() {
    for (const peerId of peerConnectionsRef.current.keys()) {
      removePeer(peerId);
    }

    // Останавливаем tracks, чтобы браузер выключил камеру/микрофон после выхода.
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    roomIdRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setRemoteVideos([]);
    setRoomId(undefined);
  }

  const isJoined = Boolean(roomId);

  return (
    <main className="app">
      <section className="panel">
        <form className="join-form" onSubmit={handleJoin}>
          <label>
            Комната
            <input
              autoComplete="off"
              disabled={isJoined}
              onChange={(event) => setRoomInput(event.target.value)}
              required
              value={roomInput}
            />
          </label>
          <label>
            Имя
            <input
              autoComplete="name"
              disabled={isJoined}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="Ваше имя"
              value={nameInput}
            />
          </label>
          <button disabled={isJoined} type="submit">
            Войти
          </button>
          <button disabled={!isJoined} onClick={handleLeave} type="button">
            Выйти
          </button>
        </form>
        <p className="status">{status}</p>
      </section>

      <section className="videos" aria-label="Видео участников">
        <article className="video-tile local">
          <video autoPlay muted playsInline ref={localVideoRef} />
          <span>Вы</span>
        </article>

        {remoteVideos.map((video) => (
          <RemoteVideoTile key={video.id} stream={video.stream} userName={video.userName} />
        ))}
      </section>
    </main>
  );
}

function RemoteVideoTile({ stream, userName }: Pick<RemoteVideo, 'stream' | 'userName'>) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <article className="video-tile">
      <video autoPlay playsInline ref={videoRef} />
      <span>{userName}</span>
    </article>
  );
}
