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
import BouncingImages from "./BouncingImages";

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
  const [showSetupOptions, setShowSetupOptions] = useState(false);
  const [showHomepage, setShowHomepage] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [setup, setSetup] = useState(false);
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
    setShowHomepage(true);
    setShowRules(false);
    setShowAbout(false);
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
    setSetupTokens(getDefaultTokens(numPlayers, pieces));
    setSetupTurn(0);
    setSetupDirection(1);
    setWinner(null);
    setLoading(false);
    setShowSetupOptions(false);
    setSetup(true);
    setSetupTransitioned(false);
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

  function handleHomepagePlay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowSetupOptions(true);
    setShowHomepage(false);
  }

  function handleHomepageRules(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowRules(true);
    setShowHomepage(false);
  }

  function handleHomepageAbout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowAbout(true);
    setShowHomepage(false);
  }

  // In the setup options form:
  if (showHomepage) {
    return (
      <main className="container">
        <BouncingImages />
        <div
          style={{
            position: "absolute",
            backgroundColor: "rgba(255, 255, 255, 0)", // semi-transparent black
            padding: "12px 20px",
            borderRadius: "40px",
            color: "black",
            zIndex: 10, // higher than bouncing images
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <h1
            style={{
              marginTop: "clamp(3rem, 10vh, 4rem)",
              fontSize: "clamp(1.5rem, 8vh, 5rem)",
            }}
          >
            Wall Go
          </h1>

          <form
            onSubmit={handleHomepagePlay}
            style={{
              width: "clamp(5rem, 15vw, 10rem)",
              height: "10vh",
              marginTop: "clamp(2.7rem, 5vh, 4rem)",
              backgroundColor: "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
            }}
          >
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "clamp(1rem, 3vh, 10rem)"
              }}
            >
              Play
            </button>
          </form>

          <form
            onSubmit={handleHomepageRules}
            style={{
              width: "clamp(5rem, 15vw, 10rem)",
              height: "10vh",
              marginTop: "clamp(2.7rem, 1vh, 4rem)",
              backgroundColor: "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
            }}
          >
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "clamp(1rem, 3vh, 10rem)"
              }}
            >
              Rules
            </button>
          </form>

          <form
            onSubmit={handleHomepageAbout}
            style={{
              width: "clamp(5rem, 15vw, 10rem)",
              height: "10vh",
              marginTop: "clamp(2.7rem, 5vh, 4rem)",
              backgroundColor: "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              boxSizing: "border-box",
            }}
          >
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "clamp(1rem, 3vh, 10rem)"
              }}
            >
              About
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Rules page
  if (showRules) {
    return (
      <main className="container">
        <BouncingImages />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <h1
            style={{
              marginTop: "clamp(3rem, 10vh, 4rem)",
              fontSize: "clamp(1.5rem, 8vh, 5rem)",
            }}
          >
            Rules
          </h1>

          <form
            onSubmit={handleReset}
            style={{
              width: "clamp(5rem, 15vw, 10rem)",
              height: "10vh",
              marginTop: "clamp(2.7rem, 5vh, 4rem)",
              backgroundColor: "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
            }}
          >
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "clamp(1rem, 3vh, 10rem)"
              }}
            >
              TO BE WRITTEN:
            </button>
          </form>
        </div>
      </main>
    );
  }

  // About page
  if (showAbout) {
    return (
      <main className="container">
        <BouncingImages />
        <form
            onSubmit={handleReset}
            style={{
              width: "clamp(5rem, 15vw, 10rem)",
              height: "10vh",
              // marginTop: "clamp(2.7rem, 5vh, 4rem)",
              backgroundColor: "rgba(0, 0, 0, 0.05)",
              borderRadius: "8px",
              top: "0vh",
              left: "2vw",
              zIndex: 20,
            }}
          >
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "clamp(1rem, 3vh, 10rem)",

              }}
            >
              Back
            </button>
          </form>
        <div
          style={{
            position: "absolute",
            backgroundColor: "rgba(255, 255, 255, 0)", // semi-transparent black
            padding: "12px 20px",
            borderRadius: "40px",
            color: "black",
            fontSize: "1rem",
            zIndex: 10, // higher than bouncing images
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            // justifyContent: "center",
          }}
        >
          <h1
            style={{
              marginTop: "clamp(3rem, 10vh, 20rem)",
              fontSize: "clamp(1.5rem, 8vh, 5rem)",
            }}
          >
            About
          </h1>
          <p
            style={{
              width: "80vw",
              height: "60vh",
              background: "#fff",
              border: "2px solid #333",
              borderRadius: "20px",
              padding: "16px 20px",
              boxShadow: "0 2px 8px rgba(0,0,0,1)",
              textAlign: "left",
            }}
          >
            Season 2 of the South Korean reality game show <strong>"Devil's Plan"</strong> introduced a simple variation on the
            game Go, aptly named <strong>Wall Go</strong>. For fans out there who are interested in trying out the game for
            themselves, I have developed both a <strong>playable online version</strong>, and a <strong>downloadable cross-platform
             app</strong>.
            <br /><br />
            The <strong>desktop app</strong> I've created was made using React, Rust and Tauri, and is downloadable for MacOS, Linus and Windows. I
            have personally tested out the MacOS and Windows builds, though the Linux one should work regardless.  <br />
            The <strong>online version</strong> is a WebAssembly port of the same Rust code, and should work on any modern browser.
            <ul>
              <li><a href="https://3alee.github.io/wall-go-wasm/" target="_blank" rel="noopener noreferrer">(Online version) https://3alee.github.io/wall-go-wasm/</a>.</li>
              <li><a href="https://github.com/3alee/Wall-Go/releases" target="_blank" rel="noopener noreferrer">(App version) https://github.com/3alee/Wall-Go/releases</a>.</li>
            </ul>
          </p>
        </div>
      </main>
    );
  }

  // Setup options form
  if (showSetupOptions) {
    return (
      <main className="container">
        <BouncingImages />
        {/* Reset Button */}
        <form
          onSubmit={handleReset}
          style={{
            width: "clamp(5rem, 15vw, 10rem)",
            height: "10vh",
            backgroundColor: "rgba(0, 0, 0, 0.05)",
            borderRadius: "8px",
            top: "1vh",
            left: "1vw",
            zIndex: 20,
            position: "absolute",
          }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "clamp(1rem, 3vh, 10rem)",
            }}
          >
            Menu
          </button>
        </form>
        <div
          className="container-rounded-bordered"
          style={{
            width: "clamp(20rem, 40vw, 60rem)",
            height: "clamp(30rem, 80vh, 45rem)",
            margin: "5vh auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            border: "2px solid #333",
            borderRadius: "20px",
            padding: "clamp(1rem, 2vw, 2rem)",
            boxSizing: "border-box",
            overflow: "auto", // scroll if needed
          }}
        >
          <h1
            style={{
              fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
              textAlign: "center",
              marginBottom: "clamp(1rem, 2vh, 2rem)",
            }}
          >
            Wall Go Setup Options
          </h1>
          <form
            onSubmit={handleSetupOptionsSubmit}
            style={{
              width: "100%",
              maxWidth: "30rem",
              display: "flex",
              flexDirection: "column",
              gap: "clamp(1rem, 3vh, 2rem)",
              fontSize: "clamp(1rem, 2.5vh, 1.5rem)",
            }}
          >
            <label style={{ display: "flex", justifyContent: "space-between" }}>
              Board Size:
              <input
                type="number"
                min={5}
                max={15}
                value={boardSize}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setBoardSize("");
                    return;
                  }
                  setBoardSize(raw);
                }}
                style={{
                  width: "clamp(3rem, 8vw, 5rem)",
                  marginLeft: "1rem",
                  fontSize: "inherit",
                }}
              />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between" }}>
              Number of Players:
              <input
                type="number"
                min={2}
                max={4}
                value={numPlayers}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setNumPlayers(n);
                  setSetupTokens(getDefaultTokens(n, Number(piecesPerPlayer) || 1));
                }}
                style={{
                  width: "clamp(3rem, 8vw, 5rem)",
                  marginLeft: "1rem",
                  fontSize: "inherit",
                }}
              />
            </label>

            <label style={{ display: "flex", justifyContent: "space-between" }}>
              Pieces per Player:
              <input
                type="number"
                min={1}
                max={boardSize === "" ? 15 : Number(boardSize)}
                value={piecesPerPlayer}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setPiecesPerPlayer("");
                    return;
                  }
                  setPiecesPerPlayer(raw);
                }}
                style={{
                  width: "clamp(3rem, 8vw, 5rem)",
                  marginLeft: "1rem",
                  fontSize: "inherit",
                }}
              />
            </label>

            <button
              type="submit"
              style={{
                padding: "clamp(0.5rem, 2vh, 1rem)",
                fontSize: "clamp(1rem, 3vh, 1.5rem)",
                width: "100%",
                borderRadius: "8px",
              }}
            >
              Start Setup
            </button>
          </form>
        </div>
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
        <BouncingImages />
        {/* Reset Button */}
        <form
            onSubmit={handleReset}
          style={{
            width: "clamp(5rem, 15vw, 10rem)",
            height: "10vh",
            backgroundColor: "rgba(0, 0, 0, 0.05)",
            borderRadius: "8px",
            top: "1vh",
            left: "1vw",
            zIndex: 20,
            position: "absolute",
          }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "clamp(1rem, 3vh, 10rem)",
            }}
          >
            Menu
          </button>
        </form>
        <div
          className="container-rounded-bordered"
          style={{
            width: "clamp(20rem, 40vw, 60rem)",
            height: "clamp(10rem, 28vh, 15rem)",
            margin: "5vh auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            border: "2px solid #333",
            borderRadius: "20px",
            padding: "clamp(0.5rem, 2vh, 1.5rem)",
            boxSizing: "border-box",
            overflow: "auto", // allows scroll if needed on very small screens
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "clamp(1rem, 4vh, 2rem)" }}>Wall Go Setup</h1>
          <div style={{ marginTop: 0 }}>
            <h2 style={{ fontSize: "clamp(0.8rem, 3vh, 1.5rem)", margin: 0 }}>Setup Phase</h2>
            <div style={{ fontSize: "clamp(0.7rem, 2.5vh, 1.2rem)" }}>
              Current Player:{" "}
              <span
                style={{
                  color: PLAYER_COLORS[setupTurn],
                  fontWeight: "bold",
                }}
              >
                {PLAYER_NAMES[setupTurn]}
              </span>
            </div>
            <div style={{ marginTop: "clamp(0.5rem, 2vh, 1.5rem)" }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <div
                  style={{
                    display: "inline-block",
                    marginRight: "clamp(0.5rem, 2vw, 1rem)",
                    fontSize: "clamp(0.7rem, 2.5vh, 1.2rem)",
                  }}
                >
                  Pieces Left:
                </div>
                {PLAYER_NAMES.slice(0, numPlayers).map((name, idx) => (
                  <li
                    key={name}
                    style={{
                      color: PLAYER_COLORS[idx],
                      fontWeight: "bold",
                      display: "inline-block",
                      marginRight: "clamp(0.5rem, 2vw, 1rem)",
                      fontSize: "clamp(0.7rem, 2.5vh, 1.2rem)",
                    }}
                  >
                    {name}: {setupTokens[idx]}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            width: "100%",
            gap: 40,
            position: "relative",
            marginTop: "0vh",
          }}
        >
          <div className="board-container">
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${size} ${size}`}
              style={svgStyle}
            >
              {/* Cell background images */}
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
                      x={colIdx + 0.15}
                      y={rowIdx + 0.15}
                      width={0.7}
                      height={0.7}
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
      </main>
    );
  }

  // Main phase
  const size = parseInt(boardSize, 10) || 7;
  return (
    <main className="container">
      <BouncingImages />
      {/* Reset Button */}
      <form
        onSubmit={handleReset}
        style={{
          width: "clamp(5rem, 15vw, 10rem)",
          height: "10vh",
          backgroundColor: "rgba(0, 0, 0, 0.05)",
          borderRadius: "8px",
          top: "1vh",
          left: "1vw",
          zIndex: 20,
          position: "absolute",
        }}
      >
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "clamp(1rem, 3vh, 10rem)",
          }}
        >
          Menu
        </button>
      </form>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div>
          <div
            className="container-rounded-bordered"
            style={{
              width: "clamp(20rem, 40vw, 60rem)",
              height: "clamp(13rem, 28vh, 15rem)",
              margin: "5vh auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              border: "2px solid #333",
              borderRadius: "20px",
              padding: "clamp(0.5rem, 2vh, 1.5rem)",
              boxSizing: "border-box",
              overflow: "auto", // allows scroll if needed on very small screens
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: "clamp(1rem, 4vh, 2rem)" }}>Wall Go</h1>
            <h2 style={{ fontSize: "clamp(0.8rem, 3vh, 1.5rem)", margin: 0 }}>Main Phase</h2>
            <div style={{ marginTop: 0 }}>
              {winner == null ? (
                <div style={{ fontSize: "clamp(0.7rem, 2.5vh, 1.2rem)" }}>
                  Current Player:{" "}
                  <span
                    style={{
                      color: PLAYER_COLORS[currentPlayer],
                      fontWeight: "bold",
                    }}
                  >
                    {PLAYER_NAMES[currentPlayer]}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: "clamp(0.7rem, 2.5vh, 1.2rem)" }}>
                  Winner:{" "}
                  <span
                    style={{
                      color: PLAYER_COLORS[winner],
                      fontWeight: "bold",
                    }}
                  >
                    {PLAYER_NAMES[winner]}
                  </span>
                </div>
              )}
            </div>
            {/* Final Scores Panel */}
            {winner != null && (
              <div>
                <h3 style={{ fontSize: "clamp(0.6rem, 2vh, 1.5rem)" }}>Final Scores</h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {PLAYER_NAMES.slice(0, numPlayers).map((name, idx) => (
                    <li
                      key={name}
                      style={{
                        color: PLAYER_COLORS[idx],
                        fontWeight: "bold",
                        marginBottom: 8,
                        fontSize: "clamp(0.6rem, 2vh, 1.5rem)",
                        display: "inline-block",
                        marginRight: "clamp(0.5rem, 2vw, 1rem)",
                      }}
                    >
                      {name}: {regionScores[idx] ?? 0}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={"fade-anim"} style={{ fontSize: "clamp(0.7rem, 2.5vh, 1.2rem)", fontWeight: "bold", marginTop: "1vh" }}>
              {winner != null ? null :
                wallPending ? "Place a wall" :
                movePath.length === 1 ? "Move to a square" :
                "Select a piece to move"
              }
            </div>
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
                        x={colIdx + 0.15}
                        y={rowIdx + 0.15}
                        width={0.7}
                        height={0.7}
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
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
