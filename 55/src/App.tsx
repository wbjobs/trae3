import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Lobby from "@/pages/Lobby";
import GameBoard from "@/pages/GameBoard";
import Replay from "@/pages/Replay";
import ScenarioEditor from "@/pages/ScenarioEditor";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/game/:id" element={<GameBoard />} />
        <Route path="/replay/:id" element={<Replay />} />
        <Route path="/scenario" element={<ScenarioEditor />} />
      </Routes>
    </Router>
  );
}
