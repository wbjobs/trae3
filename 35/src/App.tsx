import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import LobbyPage from '@/pages/LobbyPage';
import RoomPage from '@/pages/RoomPage';
import GamePage from '@/pages/GamePage';
import RecordsPage from '@/pages/RecordsPage';

export default function App() {
  return (
    <Router>
      <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/lobby" element={<LobbyPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="/game/:roomId" element={<GamePage />} />
      <Route path="/records" element={<RecordsPage />} />
      <Route path="*" element={<div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">404</h1>
          <p className="text-gray-400 mb-6">页面不存在</p>
          <a href="/" className="text-cyan-400 hover:text-cyan-300">返回首页</a>
        </div>
      </div>} />
    </Routes>
    </Router>
  );
}
