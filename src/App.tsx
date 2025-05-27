import { useState, useEffect } from "react";
import "./App.css";
import init, {
  get_game_state,
  reset_game,
  move_piece,
  place_wall,
  has_valid_moves,
  get_valid_moves_for_piece,
  set_board_and_player,
  start_main_phase,
  get_region_scores,
  next_player,
} from "./wasm-lib/pkg/wasm_lib.js";

const PLAYER_COLORS = ["#2ecc40", "#0074d9", "#ff4136", "#ffd700"];
const PLAYER_NAMES = ["Green", "Blue", "Red", "Yellow"];
const PLAYER_IMAGES = [
  process.env.PUBLIC_URL + "/piece_green.png",
  process.env.PUBLIC_URL + "/piece_blue.png",
  process.env.PUBLIC_URL + "/piece_red.png",
  process.env.PUBLIC_URL + "/piece_yellow.png"
];
const WALL_IMAGES_H = [
  process.env.PUBLIC_URL + "/wall_green_h.png",
  process.env.PUBLIC_URL + "/wall_blue_h.png",
  process.env.PUBLIC_URL + "/wall_red_h.png",
  process.env.PUBLIC_URL + "/wall_yellow_h.png"
];
const WALL_IMAGES_V = [
  process.env.PUBLIC_URL + "/wall_green_v.png",
  process.env.PUBLIC_URL + "/wall_blue_v.png",
  process.env.PUBLIC_URL + "/wall_red_v.png",
  process.env.PUBLIC_URL + "/wall_yellow_v.png"
];

function getDefaultTokens(numPlayers: number, piecesPerPlayer: number) {
  return Array(numPlayers).fill(piecesPerPlayer);
}

function App() {
  const [wasmReady, setWasmReady] = useState(false);

  useEffect(() => {
    init()
      .then(() => setWasmReady(true))
      .catch((err) => {
        console.error("WASM failed to load:", err);
      });
  }, []);

  // Use string state for boardSize and piecesPerPlayer for input flexibility
  const [boardSize, setBoardSize] = useState<string>("7");
  const [piecesPerPlayer, setPiecesPerPlayer] = useState<string>("2");
  const [numPlayers, setNumPlayers] = useState(2);
  const [board, setBoard] = useState(Array(7).fill(null).map(() => Array(7).fill(null)));
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSetupOptions, setShowSetupOptions] = useState(true);
  const [setup, setSetup] = useState(false);
  const [tokens, setTokens] = useState(getDefaultTokens(2, 2));
  const [setupTokens, setSetupTokens] = useState(getDefaultTokens(2, 2));
  const [setupTurn, setSetupTurn] = useState(0);
  const [setupDirection, setSetupDirection] = useState(1);
  const [phase, setPhase] = useState("setup");
  const [movePath, setMovePath] = useState<{ row: number; col: number }[]>([]);
  const [wallPending, setWallPending] = useState(false);
  const [wallsH, setWallsH] = useState([]);
  const [wallsV, setWallsV] = useState([]);
  const [setupTransitioned, setSetupTransitioned] = useState(false);
  const [lastMoved, setLastMoved] = useState<{ row: number; col: number } | null>(null);
  const [selectablePieces, setSelectablePieces] = useState<Record<string, boolean>>({});
  const [validMoves, setValidMoves] = useState<{ row: number; col: number }[]>([]);
  const [validMovesSource, setValidMovesSource] = useState<{ row: number; col: number } | null>(null);
  const [regionScores, setRegionScores] = useState([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);

  function setFromBackend(state: any) {
    if (typeof state.board_size === "number") setBoardSize(String(state.board_size));
    setBoard(state.board.map((row: any[]) => row.map(cell => cell === null ? null : cell)));
    setCurrentPlayer(state.current_player);
    setWinner(state.winner);
    setWallsH(state.walls_h || []);
    setWallsV(state.walls_v || []);
    setMovePath(state.move_path ? state.move_path.map(([row, col]: [number, number]) => ({ row, col })) : []);
    setWallPending(state.wall_pending || false);
    setPhase(state.phase === "Setup" ? "setup" : "main");
    if (typeof state.num_players === 'number') setNumPlayers(state.num_players);
    if (typeof state.pieces_per_player === 'number') setPiecesPerPlayer(String(state.pieces_per_player));
    if (state.tokens) setTokens(state.tokens);
    if (state.move_path && state.move_path.length > 0) {
      const [row, col] = state.move_path[state.move_path.length - 1];
      setLastMoved({ row, col });
    } else {
      setLastMoved(null);
    }
  }

  async function fetchGameState() {
    setLoading(true);
    const state = get_game_state();
    setFromBackend(state);
    setLoading(false);
  }

  useEffect(() => {
    if (!setup) fetchGameState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  useEffect(() => {
    if (phase === "main" && !loading) {
      const fetchSelectable = async () => {
        const newSelectable: Record<string, boolean> = {};
        const size = parseInt(boardSize, 10) || 7;
        const promises = [];
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            if (board[row][col] === currentPlayer) {
              promises.push(
                Promise.resolve(has_valid_moves(row, col)).then((hasMoves) => {
                  if (hasMoves) {
                    newSelectable[`${row},${col}`] = true;
                  }
                })
              );
            }
          }
        }
        await Promise.all(promises);
        if (Object.values(newSelectable).every(val => val === false)) {
          const state = next_player();
          setFromBackend(state);
        }
        setSelectablePieces(newSelectable);
      };
      fetchSelectable();
    }
  }, [board, currentPlayer, phase, boardSize, loading, wallsH, wallsV, wallPending]);

  useEffect(() => {
    if (
      movePath.length === 1 &&
      !wallPending &&
      phase === "main" &&
      winner == null
    ) {
      const { row, col } = movePath[0];
      setValidMovesSource({ row, col });
      let cancelled = false;
      const moves = get_valid_moves_for_piece(row, col);
      if (!cancelled) setValidMoves(moves.map(([r, c]: [number, number]) => ({ row: r, col: c })));
      return () => { cancelled = true; };
    } else {
      setValidMoves([]);
      setValidMovesSource(null);
    }
    // eslint-disable-next-line
  }, [movePath, board, wallsH, wallsV, wallPending, phase, winner]);

  useEffect(() => {
    if (winner != null) {
      setRegionScores(get_region_scores());
    } else {
      setRegionScores([]);
    }
  }, [winner]);

  async function handleMovePath(path: { row: number; col: number }[]) {
    if (winner != null || phase !== "main" || wallPending) return;
    const rustPath = path.map(({ row, col }) => [row, col]);
    const state = move_piece(rustPath);
    setFromBackend(state);
  }

  async function handleWallPlace(type: string, row: number, col: number) {
    if (!wallPending) return;
    const state = place_wall(type, row, col);
    setFromBackend(state);
  }

  async function handleReset() {
    const state = reset_game();
    setFromBackend(state);
    setShowSetupOptions(true);
    setSetup(false);
    setSetupTransitioned(false);
  }

  function handleSetupOptionsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Clamp and convert values
    const size = Math.max(5, Math.min(15, parseInt(boardSize, 10) || 7));
    const pieces = Math.max(1, Math.min(size, parseInt(piecesPerPlayer, 10) || 1));
    setBoardSize(String(size));
    setPiecesPerPlayer(String(pieces));
    setBoard(Array(size).fill(null).map(() => Array(size).fill(null)));
    setTokens(getDefaultTokens(numPlayers, pieces));
    setSetupTokens(getDefaultTokens(numPlayers, pieces));
    setSetupTurn(0);
    setSetupDirection(1);
    setWinner(null);
    setLoading(false);
    setShowSetupOptions(false);
    setSetup(true);
    setSetupTransitioned(false);
    setSelectedRow(null);
    setSelectedCol(null);
  }

  // Responsive SVG style
  const svgStyle = {
    display: "block",
    position: "relative" as const,
    zIndex: 1,
    background: "#fff"
  };

  // GATE UI until WASM is ready
  if (!wasmReady) {
    return <div>Loading WASM...</div>;
  }

  // Setup options form
  if (showSetupOptions) {
    return (
      <main className="container">
        <h1>Wall Go Setup Options</h1>
        <form onSubmit={handleSetupOptionsSubmit} style={{ maxWidth: 400, margin: "0 auto" }}>
          <div style={{ marginBottom: 16 }}>
            <label>
              Board Size:
              <input
                type="number"
                min={5}
                max={15}
                value={boardSize}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setBoardSize("");
                    return;
                  }
                  setBoardSize(raw);
                }}
                style={{ width: 60, marginLeft: 8 }}
              />
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>
              Number of Players:
              <input
                type="number"
                min={2}
                max={4}
                value={numPlayers}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  setNumPlayers(n);
                  setTokens(getDefaultTokens(n, Number(piecesPerPlayer) || 1));
                  setSetupTokens(getDefaultTokens(n, Number(piecesPerPlayer) || 1));
                }}
                style={{ width: 60, marginLeft: 8 }}
              />
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>
              Pieces per player:
              <input
                type="number"
                min={1}
                max={boardSize === "" ? 15 : Number(boardSize)}
                value={piecesPerPlayer}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setPiecesPerPlayer("");
                    return;
                  }
                  setPiecesPerPlayer(raw);
                }}
                style={{ width: 60, marginLeft: 8 }}
              />
            </label>
          </div>
          <button type="submit">Start Setup Phase</button>
        </form>
      </main>
    );
  }

  // Setup phase
  if (setup) {
    const size = parseInt(boardSize, 10) || 7;
    const totalTokens = setupTokens.reduce((a, b) => a + b, 0);
    if (totalTokens === 0 && !setupTransitioned) {
      setSetupTransitioned(true);
      (async () => {
        setSetup(false);
        const val = Math.max(1, Math.min(size, parseInt(piecesPerPlayer, 10) || 1));
        setTokens(getDefaultTokens(numPlayers, val));
        setLoading(true);
        const rustBoard = board.map(row => row.map(cell => (cell === null ? null : cell)));
        let nextPlayer = setupDirection === 1 ? 0 : numPlayers - 1;
        set_board_and_player(rustBoard, nextPlayer, numPlayers, val, size);
        start_main_phase();
        const afterMainPhase = get_game_state();
        setFromBackend(afterMainPhase);
        setLoading(false);
      })();
      return null;
    }
    return (
      <main className="container">
        <h1>Wall Go Setup</h1>
        <div style={{ marginTop: 0 }}>
          <h2>Setup Phase</h2>
          <div style={{ marginBottom: 0 }}>
            Current Player: <span style={{ color: PLAYER_COLORS[setupTurn], fontWeight: "bold" }}>{PLAYER_NAMES[setupTurn]}</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              width: "100%",
              gap: 40,
              position: "relative",
            }}
          >
            <div className="board-container">
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${size} ${size}`}
                style={svgStyle}
              >
                {/* Cell backgrounds */}
                {board.map((rowArr, rowIdx) =>
                  rowArr.map((_, colIdx) => (
                    <image
                      key={`cell-bg-${rowIdx}-${colIdx}`}
                      href={process.env.PUBLIC_URL + "/boardcell.png"}
                      x={colIdx}
                      y={rowIdx}
                      width={1}
                      height={1}
                      style={{
                        pointerEvents: "none",
                        userSelect: "none"
                      }}
                    />
                  ))
                )}

                {/* Setup pieces */}
                {board.map((rowArr, rowIdx) =>
                  rowArr.map((cell, colIdx) =>
                    cell !== null ? (
                      <image
                        key={`setup-piece-${rowIdx}-${colIdx}`}
                        href={PLAYER_IMAGES[cell]}
                        x={colIdx + 0.1}
                        y={rowIdx + 0.1}
                        width={0.8}
                        height={0.8}
                        style={{
                          pointerEvents: "none",
                          userSelect: "none"
                        }}
                      />
                    ) : null
                  )
                )}

                {/* Highlight available cells for current player */}
                {board.map((rowArr, rowIdx) =>
                  rowArr.map((cell, colIdx) =>
                    cell === null && setupTokens[setupTurn] > 0 ? (
                      <rect
                        key={`setup-spot-${rowIdx}-${colIdx}`}
                        x={colIdx}
                        y={rowIdx}
                        width={1}
                        height={1}
                        fill="#9a695e"
                        opacity={0}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          if (cell !== null || setupTokens[setupTurn] === 0) return;
                          const new_board = board.map(r => r.slice());
                          new_board[rowIdx][colIdx] = setupTurn;
                          setBoard(new_board);
                          const newTokens = [...setupTokens];
                          newTokens[setupTurn]--;
                          setSetupTokens(newTokens);
                          let next = setupTurn;
                          let dir = setupDirection;
                          let found = false;
                          for (let i = 0; i < numPlayers; i++) {
                            next += dir;
                            if (next < 0) { next = 0; dir = 1; }
                            if (next >= numPlayers) { next = numPlayers - 1; dir = -1; }
                            if (newTokens[next] > 0) { found = true; break; }
                          }
                          if (found) {
                            setSetupTurn(next);
                            setSetupDirection(dir);
                          }
                        }}
                      />
                    ) : null
                  )
                )}
              </svg>
            </div>
          </div>
          {/* Tokens left per player - now directly under the board */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Tokens Left</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {PLAYER_NAMES.slice(0, numPlayers).map((name, idx) => (
                <li
                  key={name}
                  style={{
                    color: PLAYER_COLORS[idx],
                    fontWeight: "bold",
                    marginBottom: 8,
                  }}
                >
                  {name}: {setupTokens[idx]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    );
  }

  // Main phase
  const size = parseInt(boardSize, 10) || 7;
  return (
    <main className="container">
      <h1>Wall Go</h1>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div style={{ marginTop: 0 }}>
          <h2>Main Phase</h2>
          <div style={{ marginBottom: 0 }}>
            {winner == null ? (
              <span>
                Current Player:{" "}
                <span
                  style={{
                    color: PLAYER_COLORS[currentPlayer],
                    fontWeight: "bold",
                  }}
                >
                  {PLAYER_NAMES[currentPlayer]}
                </span>
              </span>
            ) : (
              <span>
                Winner:{" "}
                <span
                  style={{
                    color: PLAYER_COLORS[winner],
                    fontWeight: "bold",
                  }}
                >
                  {PLAYER_NAMES[winner]}
                </span>
              </span>
            )}
          </div>
          <div style={{ margin: "12px 0", fontWeight: "bold", fontSize: 18 }}>
            {winner != null ? null :
              wallPending ? "Place a wall" :
              movePath.length === 1 ? "Move to a square" :
              "Select a piece to move"
            }
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              width: "100%",
              gap: 40,
              position: "relative",
            }}
          >
            <div className="board-container">
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${size} ${size}`}
                style={svgStyle}
                onContextMenu={e => {
                  if (
                    movePath.length === 1 &&
                    !wallPending &&
                    phase === "main" &&
                    winner == null
                  ) {
                    e.preventDefault();
                    setMovePath([]);
                  }
                }}
              >
                {/* Cell backgrounds */}
                {board.map((rowArr, rowIdx) =>
                  rowArr.map((_, colIdx) => (
                    <image
                      key={`cell-bg-${rowIdx}-${colIdx}`}
                      href={process.env.PUBLIC_URL + "/boardcell.png"}
                      x={colIdx}
                      y={rowIdx}
                      width={1}
                      height={1}
                      style={{
                        pointerEvents: "none",
                        userSelect: "none"
                      }}
                    />
                  ))
                )}

                {/* Highlight valid moves */}
                {movePath.length === 1 && !wallPending && phase === "main" && winner == null && validMovesSource && (
                  <>
                    {validMoves.map(({ row: r, col: c }) => (
                      <rect
                        key={`valid-move-highlight-${r}-${c}`}
                        x={c}
                        y={r}
                        width={1}
                        height={1}
                        fill="#ffe066"
                        opacity={0.5}
                        style={{ pointerEvents: "none" }}
                      />
                    ))}
                  </>
                )}

                {/* Pieces */}
                {board.map((rowArr, rowIdx) =>
                  rowArr.map((cell, colIdx) =>
                    cell !== null ? (
                      <image
                        key={`piece-${rowIdx}-${colIdx}`}
                        href={PLAYER_IMAGES[cell]}
                        x={colIdx + 0.1}
                        y={rowIdx + 0.1}
                        width={0.8}
                        height={0.8}
                        className={
                          !wallPending &&
                          phase === "main" &&
                          winner == null &&
                          movePath.length === 0 &&
                          cell === currentPlayer &&
                          selectablePieces[`${rowIdx},${colIdx}`]
                            ? "fade-anim"
                            : ""
                        }
                        style={{
                          cursor:
                            !wallPending &&
                            phase === "main" &&
                            winner == null &&
                            movePath.length === 0 &&
                            cell === currentPlayer &&
                            selectablePieces[`${rowIdx},${colIdx}`]
                              ? "pointer"
                              : "default",
                          pointerEvents: "auto",
                          userSelect: "none"
                        }}
                        onClick={() => {
                          if (
                            !wallPending &&
                            phase === "main" &&
                            winner == null &&
                            movePath.length === 0 &&
                            cell === currentPlayer &&
                            selectablePieces[`${rowIdx},${colIdx}`]
                          ) {
                            setMovePath([{ row: rowIdx, col: colIdx }]);
                            setSelectedRow(rowIdx);
                            setSelectedCol(colIdx);
                          }
                        }}
                      />
                    ) : null
                  )
                )}

                {/* Highlight valid moves clickable rects */}
                {movePath.length === 1 && !wallPending && phase === "main" && winner == null && validMovesSource && (
                  <>
                    {validMoves.map(({ row: r, col: c }) => (
                      <rect
                        key={`valid-move-clickable-${r}-${c}`}
                        x={c}
                        y={r}
                        width={1}
                        height={1}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          if (validMovesSource.row === r && validMovesSource.col === c) {
                            handleMovePath([{ row: r, col: c }]);
                          } else {
                            handleMovePath([
                              { row: validMovesSource.row, col: validMovesSource.col },
                              { row: r, col: c }
                            ]);
                          }
                          setMovePath([]);
                        }}
                      />
                    ))}
                  </>
                )}

                {/* Permanent walls */}
                {wallsH.map(([r, c, player], i) => (
                  <image
                    key={`h-${r}-${c}-${i}`}
                    href={WALL_IMAGES_H[player]}
                    x={c}
                    y={r + 1 - 0.12}
                    width={1}
                    height={0.23}
                    style={{
                      pointerEvents: "none",
                      userSelect: "none"
                    }}
                  />
                ))}
                {wallsV.map(([r, c, player], i) => (
                  <image
                    key={`v-${r}-${c}-${i}`}
                    href={WALL_IMAGES_V[player]}
                    x={c + 1 - 0.14}
                    y={r}
                    width={0.28}
                    height={1}
                    style={{
                      pointerEvents: "none",
                      userSelect: "none"
                    }}
                  />
                ))}

                {/* Pending wall selectors */}
                {wallPending &&
                  Array.from({ length: size - 1 }).map((_, r) =>
                    Array.from({ length: size }).map((_, c) => {
                      if (r >= size - 1) return null;
                      if (wallsH.some(([hr, hc, _]) => hr === r && hc === c)) return null;
                      const last = lastMoved;
                      if (
                        !last ||
                        !(
                          (last.row === r && last.col === c) ||
                          (last.row === r + 1 && last.col === c)
                        )
                      )
                        return null;
                      return (
                        <rect
                          key={`hwall-sel-${r}-${c}`}
                          x={c}
                          y={r + 1 - 0.057}
                          width={1}
                          height={0.11}
                          fill="#ffb347"
                          opacity={0.6}
                          rx={0.02}
                          style={{ cursor: "pointer" }}
                          onClick={() => handleWallPlace("h", r, c)}
                        />
                      );
                    })
                  )}
                {wallPending &&
                  Array.from({ length: size }).map((_, r) =>
                    Array.from({ length: size - 1 }).map((_, c) => {
                      if (c >= size - 1) return null;
                      if (wallsV.some(([vr, vc, _]) => vr === r && vc === c)) return null;
                      const last = lastMoved;
                      if (
                        !last ||
                        !(
                          (last.row === r && last.col === c) ||
                          (last.row === r && last.col === c + 1)
                        )
                      )
                        return null;
                      return (
                        <rect
                          key={`vwall-sel-${r}-${c}`}
                          x={c + 1 - 0.057}
                          y={r}
                          width={0.11}
                          height={1}
                          fill="#ffb347"
                          opacity={0.4}
                          rx={0.02}
                          style={{ cursor: "pointer" }}
                          onClick={() => handleWallPlace("v", r, c)}
                        />
                      );
                    })
                  )}
              </svg>
            </div>
            {winner != null && (
              <div
                style={{
                  minWidth: 180,
                  background: "#fff",
                  border: "2px solid #333",
                  borderRadius: 8,
                  padding: "16px 20px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  marginLeft: 0,
                }}
              >
                <h3 style={{ marginTop: 0 }}>Final Scores</h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {PLAYER_NAMES.slice(0, numPlayers).map((name, idx) => (
                    <li
                      key={name}
                      style={{
                        color: PLAYER_COLORS[idx],
                        fontWeight: "bold",
                        marginBottom: 8,
                      }}
                    >
                      {name}: {regionScores[idx] ?? 0}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 24 }}>
            <button onClick={handleReset}>Reset Game</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
