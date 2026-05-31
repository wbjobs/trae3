import { useParams } from 'react-router-dom';
import { RoomLobby } from '../components/room/RoomLobby';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();

  if (!roomId) {
    return <div className="text-center text-white py-20">房间ID无效</div>;
  }

  return <RoomLobby roomId={roomId} />;
}
