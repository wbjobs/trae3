import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Lobby from "@/pages/Lobby";
import Battle from "@/pages/Battle";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/battle/:roomId" element={<Battle />} />
      </Routes>
    </Router>
  );
}
