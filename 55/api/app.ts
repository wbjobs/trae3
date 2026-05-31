import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import "./database.js";
import {
  createGame,
  getGameList,
  getGameState,
  getScenarioList,
  getScenarioDetail,
} from "./services/gameService.js";
import { getReplay } from "./services/replayService.js";
import {
  createSnapshot,
  getSnapshots,
  restoreSnapshot,
  deleteSnapshot,
} from "./services/snapshotService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/api/games", (_req: Request, res: Response) => {
  try {
    const games = getGameList();
    res.json({ success: true, games });
  } catch (error) {
    res.status(500).json({ success: false, error: "获取对局列表失败" });
  }
});

app.get("/api/games/:id", (req: Request, res: Response) => {
  try {
    const state = getGameState(req.params.id);
    if (!state) {
      res.status(404).json({ success: false, error: "对局不存在" });
      return;
    }
    res.json({ success: true, game: state });
  } catch (error) {
    res.status(500).json({ success: false, error: "获取对局详情失败" });
  }
});

app.post("/api/games", (req: Request, res: Response) => {
  try {
    const { scenarioId, maxTurns } = req.body;
    if (!scenarioId) {
      res.status(400).json({ success: false, error: "缺少剧本ID" });
      return;
    }
    const result = createGame(scenarioId, maxTurns || 20);
    res.status(201).json({ success: true, game: result });
  } catch (error: any) {
    console.error("Create game error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/scenarios", (_req: Request, res: Response) => {
  try {
    const scenarios = getScenarioList();
    res.json({ success: true, scenarios });
  } catch (error) {
    res.status(500).json({ success: false, error: "获取剧本列表失败" });
  }
});

app.get("/api/scenarios/:id", (req: Request, res: Response) => {
  try {
    const scenario = getScenarioDetail(req.params.id);
    if (!scenario) {
      res.status(404).json({ success: false, error: "剧本不存在" });
      return;
    }
    res.json({ success: true, scenario });
  } catch (error) {
    res.status(500).json({ success: false, error: "获取剧本详情失败" });
  }
});

app.get("/api/replay/:gameId", (req: Request, res: Response) => {
  try {
    const replay = getReplay(req.params.gameId);
    res.json({ success: true, turns: replay });
  } catch (error) {
    res.status(500).json({ success: false, error: "获取回放数据失败" });
  }
});

app.get("/api/games/:gameId/snapshots", (req: Request, res: Response) => {
  try {
    const snapshots = getSnapshots(req.params.gameId);
    res.json({ success: true, snapshots });
  } catch (error) {
    res.status(500).json({ success: false, error: "获取快照列表失败" });
  }
});

app.post("/api/games/:gameId/snapshots", (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const snapshot = createSnapshot(req.params.gameId, name || "快照");
    if (!snapshot) {
      res.status(404).json({ success: false, error: "对局不存在" });
      return;
    }
    res.json({ success: true, snapshot });
  } catch (error) {
    console.error("Create snapshot error:", error);
    res.status(500).json({ success: false, error: "创建快照失败" });
  }
});

app.post("/api/games/:gameId/snapshots/:snapshotId/restore", (req: Request, res: Response) => {
  try {
    const state = restoreSnapshot(req.params.snapshotId);
    if (!state) {
      res.status(404).json({ success: false, error: "快照不存在" });
      return;
    }
    res.json({ success: true, state });
  } catch (error) {
    res.status(500).json({ success: false, error: "恢复快照失败" });
  }
});

app.delete("/api/games/:gameId/snapshots/:snapshotId", (req: Request, res: Response) => {
  try {
    const deleted = deleteSnapshot(req.params.snapshotId);
    res.json({ success: deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: "删除快照失败" });
  }
});

app.use("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "ok" });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", error);
  console.error(error.stack);
  res.status(500).json({ success: false, error: "Server internal error", message: error.message });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "API not found" });
});

export default app;
