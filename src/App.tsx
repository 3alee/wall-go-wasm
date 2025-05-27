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
} from "./wasm-lib/pkg/wasm_lib.js";;

// Remove the fixed BOARD_SIZE
// const BOARD_SIZE = 7;
const PLAYER_COLORS = ["#2ecc40", "#0074d9", "#ff4136", "#ffd700"];
const PLAYER_NAMES = ["Green", "Blue", "Red", "Yellow"];
const PLAYER_IMAGES = [
  "/piece_green.png",
  "/piece_blue.png",
  "/piece_red.png",
  "/piece_yellow.png"
];
const WALL_IMAGES_H = [
  "/wall_green_h.png",
  "/wall_blue_h.png",
  "/wall_red_h.png",
  "/wall_yellow_h.png"
];
const WALL_IMAGES_V = [
  "/wall_green_v.png",
  "/wall_blue_v.png",
  "/wall_red_v.png",
  "/wall_yellow_v.png"
];
const BOARD_DIM = 70; // Board cell size in px (change as desired)


function getDefaultTokens(numPlayers: number, piecesPerPlayer: number) {
  return Array(numPlayers).fill(piecesPerPlayer);
}

function App() {
  // WASM ready state
  const [wasmReady, setWasmReady] = useState(false);

  // Initialize WASM once, before any other logic
  useEffect(() => {
    console.log("Starting WASM init...");
    init()
      .then(() => {
        console.log("WASM loaded!");
        setWasmReady(true);
      })
      .catch((err) => {
        console.error("WASM failed to load:", err);
      });
  }, []);

  // All your hooks here, always at the top level
  const [boardSize, setBoardSize] = useState(7);
  const [board, setBoard] = useState(Array(boardSize).fill(null).map(() => Array(boardSize).fill(null)));
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSetupOptions, setShowSetupOptions] = useState(true);
  const [setup, setSetup] = useState(false);
  const [numPlayers, setNumPlayers] = useState(2);
  const [piecesPerPlayer, setPiecesPerPlayer] = useState(2);
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


  async function fetchGameState() {
    setLoading(true);
    const state = get_game_state();
    setFromBackend(state);
    setLoading(false);
  }


  // Update setFromBackend to use boardSize from backend if present
  function setFromBackend(state: any) {
    if (typeof state.board_size === "number") setBoardSize(state.board_size);
    setBoard(state.board.map((row: any[]) => row.map(cell => cell === null ? null : cell)));
    setCurrentPlayer(state.current_player);
    setWinner(state.winner);
    setWallsH(state.walls_h || []);
    setWallsV(state.walls_v || []);
    setMovePath(state.move_path ? state.move_path.map(([row, col]: [number, number]) => ({ row, col })) : []);
    setWallPending(state.wall_pending || false);
    setPhase(state.phase === "Setup" ? "setup" : "main");
    if (typeof state.num_players === 'number') setNumPlayers(state.num_players);
    if (typeof state.pieces_per_player === 'number') setPiecesPerPlayer(state.pieces_per_player);
    if (state.tokens) setTokens(state.tokens);
    // NEW: Track last moved piece for wall placement
    if (state.move_path && state.move_path.length > 0) {
      const [row, col] = state.move_path[state.move_path.length - 1];
      setLastMoved({ row, col });
    } else {
      setLastMoved(null);
    }
  }


  useEffect(() => {
    if (!setup) fetchGameState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  useEffect(() => {
    if (phase === "main" && !loading) {
      const fetchSelectable = async () => {
        const newSelectable: Record<string, boolean> = {};
        const promises = [];
        for (let row = 0; row < boardSize; row++) {
          for (let col = 0; col < boardSize; col++) {
            if (board[row][col] === currentPlayer) {
              // Check for valid moves
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
          // If no selectable pieces, automatically move to next player
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

  // --- Main phase logic ---
  // Select and move a piece (send path to backend)
  async function handleMovePath(path: { row: number; col: number }[]) {
    if (winner != null || phase !== "main" || wallPending) return;
    // path: [{row, col}, ...]
    const rustPath = path.map(({ row, col }) => [row, col]);
    const state = move_piece(rustPath);
    setFromBackend(state);
  }

  // Place a wall after a move
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

  // Update handleSetupOptionsSubmit to use boardSize
  function handleSetupOptionsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTokens(getDefaultTokens(numPlayers, piecesPerPlayer));
    setSetupTokens(getDefaultTokens(numPlayers, piecesPerPlayer));
    setSetupTurn(0);
    setSetupDirection(1);
    setBoard(Array(boardSize).fill(null).map(() => Array(boardSize).fill(null)));
    setWinner(null);
    setLoading(false);
    setShowSetupOptions(false);
    setSetup(true);
    setSetupTransitioned(false);
    setSelectedRow(null);
    setSelectedCol(null);
  }

  // // GATE UI until WASM is ready
  if (!wasmReady) {
    return <div>Loading WASM...</div>;
  }

  // In the setup options form:
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
                  const n = Math.max(5, Math.min(15, parseInt(e.target.value, 10) || 7));
                  setBoardSize(n);
                  setBoard(Array(n).fill(null).map(() => Array(n).fill(null)));
                  setPiecesPerPlayer(Math.min(piecesPerPlayer, n));
                  setTokens(getDefaultTokens(numPlayers, Math.min(piecesPerPlayer, n)));
                  setSetupTokens(getDefaultTokens(numPlayers, Math.min(piecesPerPlayer, n)));
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
                  setTokens(getDefaultTokens(n, piecesPerPlayer));
                  setSetupTokens(getDefaultTokens(n, piecesPerPlayer));
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
                max={boardSize}
                value={piecesPerPlayer}
                onChange={e => {
                  const val = Math.max(1, Math.min(boardSize, parseInt(e.target.value, 10) || 1));
                  setPiecesPerPlayer(val);
                  setTokens(getDefaultTokens(numPlayers, val));
                  setSetupTokens(getDefaultTokens(numPlayers, val));
                }}
                style={{ width: 60, marginLeft: 8 }}
              />
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <b>Tokens per player:</b>
            <span style={{ marginLeft: 8, fontWeight: "bold" }}>{piecesPerPlayer}</span>
          </div>
          <button type="submit">Start Setup Phase</button>
        </form>
      </main>
    );
  }

  if (setup) {
    const totalTokens = setupTokens.reduce((a, b) => a + b, 0);
    if (totalTokens === 0 && !setupTransitioned) {
      setSetupTransitioned(true);
      (async () => {
        setSetup(false);
        setTokens(getDefaultTokens(numPlayers, piecesPerPlayer));
        setLoading(true);
        const rustBoard = board.map(row => row.map(cell => (cell === null ? null : cell)));
        let nextPlayer = setupDirection === 1 ? 0 : numPlayers - 1;
        set_board_and_player(rustBoard, nextPlayer, numPlayers, piecesPerPlayer, boardSize);
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
            {/* Board styled like main phase */}
            <div
              style={{
                display: "inline-block",
                border: "2px solid #333",
                background: "#fff",
                marginBottom: 16,
                position: "relative",
                minWidth: boardSize * BOARD_DIM,
                maxWidth: boardSize * BOARD_DIM,
                minHeight: boardSize * BOARD_DIM,
                maxHeight: boardSize * BOARD_DIM,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                borderRadius: 8,
              }}
            >
              <div style={{ position: "relative", display: "inline-block" }}>
                {/* Table background image */}
                <img
                  src="/wood_table.jpg"
                  alt="background"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: boardSize * BOARD_DIM,
                    height: boardSize * BOARD_DIM,
                    objectFit: "cover",
                    borderRadius: 8,
                    zIndex: 0,
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                  draggable={false}
                />
                {/* Board SVG */}
                <svg
                  width={boardSize * BOARD_DIM}
                  height={boardSize * BOARD_DIM}
                  style={{ display: "block", position: "relative", zIndex: 1 }}
                >
                  {/* Cell background images */}
                  {board.map((rowArr, rowIdx) =>
                    rowArr.map((_, colIdx) => (
                      <image
                        key={`cell-bg-${rowIdx}-${colIdx}`}
                        href="/boardcell.png"
                        x={colIdx * BOARD_DIM}
                        y={rowIdx * BOARD_DIM}
                        width={BOARD_DIM}
                        height={BOARD_DIM}
                        style={{
                          pointerEvents: "none",
                          userSelect: "none"
                        }}
                      />
                    ))
                  )}

                  {/* Draw setup pieces */}
                  {board.map((rowArr, rowIdx) =>
                    rowArr.map((cell, colIdx) =>
                      cell !== null ? (
                        <image
                          key={`setup-piece-${rowIdx}-${colIdx}`}
                          href={PLAYER_IMAGES[cell]}
                          x={colIdx * BOARD_DIM + BOARD_DIM * 0.1}
                          y={rowIdx * BOARD_DIM + BOARD_DIM * 0.1}
                          width={BOARD_DIM * 0.8}
                          height={BOARD_DIM * 0.8}
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
                          x={colIdx * BOARD_DIM}
                          y={rowIdx * BOARD_DIM}
                          width={BOARD_DIM}
                          height={BOARD_DIM}
                          fill="#9a695e"
                          opacity={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            if (cell !== null || setupTokens[setupTurn] === 0) return;
                            // Place token for current setupTurn
                            const new_board = board.map(r => r.slice());
                            new_board[rowIdx][colIdx] = setupTurn;
                            setBoard(new_board);
                            const newTokens = [...setupTokens];
                            newTokens[setupTurn]--;
                            setSetupTokens(newTokens);
                            // Find next player with tokens
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

  // --- Main phase UI (styled to match setup phase) ---
  return (
    <main
      className="container"
      style={{
        background: phase === "main" ? "#e0e0e0" : undefined,
        minHeight: "100vh",
        paddingBottom: 32,
      }}
    >
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
            {/* Board */}
            <div
              style={{
                display: "inline-block",
                border: "2px solid #333",
                background: "#fff",
                marginBottom: 16,
                position: "relative",
                minWidth: boardSize * BOARD_DIM,
                maxWidth: boardSize * BOARD_DIM,
                minHeight: boardSize * BOARD_DIM, // <-- Add this
                maxHeight: boardSize * BOARD_DIM, // <-- And this
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                borderRadius: 8,
              }}
            >
              {/* Background image */}
              <img
                src="/playing_board.png" // or your image URL
                alt="background"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: boardSize * BOARD_DIM,
                  height: boardSize * BOARD_DIM,
                  objectFit: "cover",
                  borderRadius: 8,
                  zIndex: 0,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
                draggable={false}
              />
              <svg
                width={boardSize * BOARD_DIM}
                height={boardSize * BOARD_DIM}
                style={{ display: "block", position: "relative", zIndex: 1 }}
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
                {/* Cell background images */}
                  {board.map((rowArr, rowIdx) =>
                    rowArr.map((_, colIdx) => (
                      <image
                        key={`cell-bg-${rowIdx}-${colIdx}`}
                        href="/boardcell.png"
                        x={colIdx * BOARD_DIM}
                        y={rowIdx * BOARD_DIM}
                        width={BOARD_DIM}
                        height={BOARD_DIM}
                        style={{
                          pointerEvents: "none",
                          userSelect: "none"
                        }}
                      />
                    ))
                  )}

                {/* Highlight valid moves after piece selection */}
                {movePath.length === 1 && !wallPending && phase === "main" && winner == null && validMovesSource && (
                  <>
                    {/* 1. Draw yellow highlights underneath */}
                    {validMoves.map(({ row: r, col: c }) => (
                      <rect
                        key={`valid-move-highlight-${r}-${c}`}
                        x={c * BOARD_DIM}
                        y={r * BOARD_DIM}
                        width={BOARD_DIM}
                        height={BOARD_DIM}
                        fill="#ffe066"
                        opacity={0.5}
                        style={{ pointerEvents: "none" }}
                      />
                    ))}
                  </>
                )}

                {/* Draw pieces with click-to-select */}
                {board.map((rowArr, rowIdx) =>
                  rowArr.map((cell, colIdx) =>
                    cell !== null ? (
                      <image
                        key={`piece-${rowIdx}-${colIdx}`}
                        href={PLAYER_IMAGES[cell]}
                        x={colIdx * BOARD_DIM + BOARD_DIM * 0.1}
                        y={rowIdx * BOARD_DIM + BOARD_DIM * 0.1}
                        width={BOARD_DIM * 0.8}
                        height={BOARD_DIM * 0.8}
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

                
                {/* Highlight valid moves after piece selection */}
                {movePath.length === 1 && !wallPending && phase === "main" && winner == null && validMovesSource && (
                  <>
                    {/* 2. Draw transparent clickable rects on top */}
                    {validMoves.map(({ row: r, col: c }) => (
                      <rect
                        key={`valid-move-clickable-${r}-${c}`}
                        x={c * BOARD_DIM}
                        y={r * BOARD_DIM}
                        width={BOARD_DIM}
                        height={BOARD_DIM}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          if (validMovesSource.row === r && validMovesSource.col === c) {
                            // Stay-in-place move: path of length 1
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

                {/* Draw permanent walls */}
                {wallsH.map(([r, c, player], i) => (
                  <image
                    key={`h-${r}-${c}-${i}`}
                    href={WALL_IMAGES_H[player]}
                    x={c * BOARD_DIM}
                    y={(r + 1) * BOARD_DIM - 8} // Adjust -8 for vertical centering if needed
                    width={BOARD_DIM}
                    height={16} // Adjust height to match your PNG
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
                    x={(c + 1) * BOARD_DIM - 8} // Adjust -8 for horizontal centering if needed
                    y={r * BOARD_DIM}
                    width={20} // Adjust width to match your PNG
                    height={BOARD_DIM}
                    style={{
                      pointerEvents: "none",
                      userSelect: "none"
                    }}
                  />
                ))}

                {/* Draw wall selectors */}
                {wallPending &&
                  Array.from({ length: boardSize - 1 }).map((_, r) =>
                    Array.from({ length: boardSize }).map((_, c) => {
                      if (r >= boardSize - 1) return null; // Prevent South edge
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
                          x={c * BOARD_DIM}
                          y={(r + 1) * BOARD_DIM - 2}
                          width={BOARD_DIM}
                          height={4}
                          fill="#ffb347"
                          opacity={0.6}
                          rx={1}
                          style={{ cursor: "pointer" }}
                          onClick={() => handleWallPlace("h", r, c)}
                        />
                      );
                    })
                  )}
                {wallPending &&
                  Array.from({ length: boardSize }).map((_, r) =>
                    Array.from({ length: boardSize - 1 }).map((_, c) => {
                      if (c >= boardSize - 1) return null; // Prevent East edge
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
                          x={(c + 1) * BOARD_DIM - 2}
                          y={r * BOARD_DIM}
                          width={4}
                          height={BOARD_DIM}
                          fill="#ffb347"
                          opacity={0.4}
                          rx={1}
                          style={{ cursor: "pointer" }}
                          onClick={() => handleWallPlace("v", r, c)}
                        />
                      );
                    })
                  )}
              </svg>
            </div>
            {/* Final Scores Panel */}
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
          {/* Reset Button */}
          <div style={{ marginBottom: 24 }}>
            <button onClick={handleReset}>Reset Game</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
