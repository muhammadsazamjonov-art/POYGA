import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Box, RotateCcw, Trophy, Users } from 'lucide-react';
import type { ArcadeScene, CellRect } from './game/arcadeScene';

type Cell = 'X' | 'O' | null;
type Difficulty = 'easy' | 'normal' | 'impossible';
type Mode = 'cpu' | 'duo';
type Scores = { wins: number; losses: number; draws: number };

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const SCORES_KEY = 'redline-tictactoe-v1';
const EMPTY_SCORES: Scores = { wins: 0, losses: 0, draws: 0 };

function readScores(): Scores {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return EMPTY_SCORES;
    const parsed = JSON.parse(raw) as Partial<Scores>;
    const safe = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
    return { wins: safe(parsed.wins), losses: safe(parsed.losses), draws: safe(parsed.draws) };
  } catch {
    return EMPTY_SCORES;
  }
}

function winnerOf(board: Cell[]) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { mark: board[a] as 'X' | 'O', line };
    }
  }
  return null;
}

const other = (mark: 'X' | 'O') => (mark === 'X' ? 'O' : 'X');

/** Full minimax with depth preference: the AI never loses on "impossible". */
function minimax(board: Cell[], turn: 'X' | 'O', me: 'X' | 'O', depth = 0): { score: number; move: number } {
  const result = winnerOf(board);
  if (result) return { score: result.mark === me ? 10 - depth : depth - 10, move: -1 };
  const free = board.reduce<number[]>((list, cell, index) => (cell ? list : [...list, index]), []);
  if (free.length === 0) return { score: 0, move: -1 };

  let best = turn === me ? { score: -Infinity, move: free[0] } : { score: Infinity, move: free[0] };
  for (const move of free) {
    const next = [...board];
    next[move] = turn;
    const { score } = minimax(next, other(turn), me, depth + 1);
    if (turn === me ? score > best.score : score < best.score) best = { score, move };
  }
  return best;
}

function chooseMove(board: Cell[], mark: 'X' | 'O', difficulty: Difficulty) {
  const free = board.reduce<number[]>((list, cell, index) => (cell ? list : [...list, index]), []);
  if (free.length === 0) return -1;
  if (difficulty === 'easy') {
    // Still blocks an immediate win, otherwise plays loose.
    const immediate = LINES.find(line => line.filter(index => board[index] === mark).length === 2 && line.some(index => !board[index]));
    if (immediate && Math.random() < 0.5) return immediate.find(index => !board[index]) ?? free[0];
    return free[Math.floor(Math.random() * free.length)];
  }
  const best = minimax(board, mark, mark).move;
  if (difficulty === 'normal' && Math.random() < 0.3) {
    const alternatives = free.filter(index => index !== best);
    if (alternatives.length) return alternatives[Math.floor(Math.random() * alternatives.length)];
  }
  return best;
}

export function TicTacToe({ onBack, quality = 'high' }: { onBack: () => void; quality?: 'high' | 'low' }) {
  const [board, setBoard] = useState<Cell[]>(() => Array<Cell>(9).fill(null));
  const [human] = useState<'X' | 'O'>('X');
  const [mode, setMode] = useState<Mode>('cpu');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [scores, setScores] = useState<Scores>(readScores);
  const [rounds, setRounds] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [rects, setRects] = useState<CellRect[] | null>(null);
  const [sceneMode, setSceneMode] = useState<'3d' | 'flat'>('3d');
  const settled = useRef(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const sceneApi = useRef<ArcadeScene | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cpuMark = other(human);
  const result = useMemo(() => winnerOf(board), [board]);
  const full = board.every(Boolean);
  const turn = board.filter(Boolean).length % 2 === 0 ? 'X' : 'O';
  const finished = !!result || full;
  const cpuThinking = mode === 'cpu' && !finished && turn === cpuMark;
  const interactive = !finished && (mode === 'duo' || turn === human);
  const ghostMark = interactive && hovered !== null && !board[hovered] ? turn : null;

  const status = result
    ? mode === 'duo'
      ? `${result.mark} TAKES THE ROUND.`
      : result.mark === human
        ? 'YOU TAKE THE ROUND.'
        : 'THE MACHINE TAKES IT.'
    : full
      ? 'DEAD EVEN. NOBODY BLINKS.'
      : cpuThinking
        ? 'THE MACHINE IS THINKING…'
        : mode === 'duo'
          ? `${turn} TO MOVE.`
          : 'YOUR MOVE.';

  const persist = useCallback((next: Scores) => {
    setScores(next);
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(next));
    } catch {
      // Storage may be blocked; the game still works for this session.
    }
  }, []);

  useEffect(() => {
    if (!finished || settled.current) return;
    settled.current = true;
    setRounds(value => value + 1);
    if (mode === 'duo') return;
    if (result?.mark === human) persist({ ...scores, wins: scores.wins + 1 });
    else if (result) persist({ ...scores, losses: scores.losses + 1 });
    else persist({ ...scores, draws: scores.draws + 1 });
  }, [finished, human, mode, persist, result, scores]);

  const play = useCallback(
    (index: number) => {
      if (board[index] || finished) return;
      if (mode === 'cpu' && turn !== human) return;
      setHovered(null);
      setBoard(current => {
        if (current[index] || winnerOf(current)) return current;
        const next = [...current];
        next[index] = turn;
        return next;
      });
    },
    [board, finished, human, mode, turn],
  );

  const reset = useCallback(() => {
    settled.current = false;
    setBoard(Array<Cell>(9).fill(null));
    setHovered(null);
  }, []);

  // Build the WebGL board once; fall back to the flat grid if it cannot start.
  useEffect(() => {
    let active = true;
    let scene: ArcadeScene | null = null;
    void import('./game/arcadeScene')
      .then(({ ArcadeScene: Scene }) => {
        if (!active || !sceneRef.current) return;
        try {
          scene = new Scene(sceneRef.current, {
            quality,
            onLayout: next => {
              if (active) setRects(next);
            },
          });
          sceneApi.current = scene;
          setSceneMode('3d');
        } catch (cause) {
          console.warn('3D arcade board unavailable, using the flat board:', cause);
          if (active) setSceneMode('flat');
        }
      })
      .catch(() => {
        if (active) setSceneMode('flat');
      });
    return () => {
      active = false;
      scene?.dispose();
      sceneApi.current = null;
    };
  }, [quality]);

  useEffect(() => {
    sceneApi.current?.setState({
      board,
      winning: result?.line ?? null,
      ghost: ghostMark,
      ghostIndex: sceneMode === '3d' ? hovered : null,
    });
  }, [board, ghostMark, hovered, result, sceneMode]);

  // The CPU answers the human's move once the board has settled.
  useEffect(() => {
    if (mode !== 'cpu' || finished || turn !== cpuMark) return;
    const timer = window.setTimeout(() => {
      setBoard(current => {
        if (winnerOf(current) || current.every(Boolean)) return current;
        const move = chooseMove(current, cpuMark, difficulty);
        if (move < 0) return current;
        const next = [...current];
        next[move] = cpuMark;
        return next;
      });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [board, cpuMark, difficulty, finished, mode, turn]);

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => boardRef.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(timer);
  }, [finished]);

  // Keyboard shortcuts stay global: focus is lost whenever a square becomes disabled.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        reset();
      } else if (event.key === 'Enter' && finished) {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, reset]);

  const changeMode = (next: Mode) => {
    setMode(next);
    reset();
  };

  return (
    <section className="ttt-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={13} /> BACK TO THE STREETS</button>
      <div className="ttt-head">
        <div>
          <div className="eyebrow"><i /> THE ARCADE / MINI GAME 01</div>
          <h1>THREE IN<br /><span>A ROW.</span></h1>
          <p>No engine, no nitro, no excuses. A neon board in full 3D — take three squares before the machine does.</p>
        </div>
        <div className="ttt-score">
          <div className="ttt-score-head"><Trophy size={15} /> THIS DEVICE</div>
          <div className="ttt-score-cells">
            <div><span>WINS</span><strong>{scores.wins}</strong></div>
            <div><span>LOSSES</span><strong>{scores.losses}</strong></div>
            <div><span>DRAWS</span><strong>{scores.draws}</strong></div>
          </div>
          <div className="ttt-score-foot">{rounds > 0 ? `${rounds} ROUND${rounds === 1 ? '' : 'S'} THIS SESSION` : 'FIRST ROUND. TAKE IT.'}</div>
        </div>
      </div>

      <div className="ttt-layout">
        <div className="ttt-panel">
          <div className="ttt-controls">
            <div className="ttt-control">
              <span className="ttt-label">OPPONENT</span>
              <div className="segmented-control" role="group" aria-label="Opponent">
                <button aria-pressed={mode === 'cpu'} className={mode === 'cpu' ? 'active' : ''} onClick={() => changeMode('cpu')}><Bot size={13} /> CPU</button>
                <button aria-pressed={mode === 'duo'} className={mode === 'duo' ? 'active' : ''} onClick={() => changeMode('duo')}><Users size={13} /> 2 PLAYERS</button>
              </div>
            </div>
            <div className="ttt-control">
              <span className="ttt-label">DIFFICULTY</span>
              <div className="segmented-control" role="group" aria-label="Difficulty">
                {(['easy', 'normal', 'impossible'] as Difficulty[]).map(level => (
                  <button
                    key={level}
                    aria-pressed={difficulty === level}
                    className={difficulty === level ? 'active' : ''}
                    disabled={mode === 'duo'}
                    onClick={() => { setDifficulty(level); reset(); }}
                  >
                    {level.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`ttt-status ${result ? 'is-win' : ''} ${finished && !result ? 'is-draw' : ''}`} role="status" aria-live="polite">
            <span className="ttt-turn-swatch" data-mark={finished ? undefined : turn} />
            <strong>{status}</strong>
            {finished && <button className="ttt-again" onClick={() => reset()}>PLAY AGAIN <RotateCcw size={13} /></button>}
          </div>

          <div
            className={`ttt-board ${sceneMode === '3d' && rects ? 'is-3d' : 'is-flat'}`}
            ref={boardRef}
            role="group"
            aria-label="Tic tac toe board"
            tabIndex={-1}
            data-scene={sceneMode === '3d' ? '3d' : 'flat'}
            data-win={result ? 'true' : 'false'}
          >
            <div className="ttt-scene" ref={sceneRef} aria-hidden="true" />
            <div className="ttt-cells">
              {board.map((cell, index) => (
                <button
                  key={index}
                  className={`ttt-cell ${cell ? `is-${cell.toLowerCase()}` : ''} ${result?.line.some(square => square === index) ? 'is-winning' : ''}`}
                  style={sceneMode === '3d' && rects ? { left: rects[index].left, top: rects[index].top, width: rects[index].width, height: rects[index].height } : undefined}
                  aria-label={`Square ${index + 1}${cell ? `, ${cell}` : ', empty'}`}
                  disabled={!!cell || finished || (mode === 'cpu' && turn !== human)}
                  onClick={() => play(index)}
                  onPointerEnter={() => { if (!cell && !finished) setHovered(index); }}
                  onPointerLeave={() => setHovered(current => (current === index ? null : current))}
                  onFocus={() => { if (!cell && !finished) setHovered(index); }}
                  onBlur={() => setHovered(current => (current === index ? null : current))}
                >
                  <span className={cell ? 'ttt-mark' : 'ttt-mark ttt-mark-ghost'} aria-hidden="true">{cell ?? (mode === 'cpu' ? human : turn)}</span>
                </button>
              ))}
            </div>
            {result && sceneMode !== '3d' && <span className={`ttt-strike ${result.mark === 'O' ? 'is-o' : ''}`} aria-hidden="true" />}
            {sceneMode === '3d' && rects && <span className="ttt-3d-badge"><Box size={11} /> 3D BOARD</span>}
          </div>

          <div className="ttt-legend">
            <span><i className="ttt-dot ttt-dot-x" /> {mode === 'cpu' ? 'YOU' : 'PLAYER 1'} — X</span>
            <span><i className="ttt-dot ttt-dot-o" /> {mode === 'cpu' ? 'CPU' : 'PLAYER 2'} — O</span>
            <span className="ttt-keys"><kbd>R</kbd> RESTART · <kbd>ENTER</kbd> NEXT ROUND</span>
          </div>
        </div>

        <aside className="ttt-side">
          <div className="ttt-side-block">
            <span className="ttt-label">HOW TO WIN</span>
            <p>Claim three squares in a line — across, down or diagonally. One round, one winner.</p>
          </div>
          <div className="ttt-side-block">
            <span className="ttt-label">THE MACHINE</span>
            <p>Easy plays fast and loose. Normal blinks occasionally. Impossible solves the whole tree, so a draw is the best you get.</p>
          </div>
          <div className="ttt-side-block ttt-side-highlight">
            <span className="ttt-label">HOUSE RULE</span>
            <p>Winning moves are yours. Losing moves are mine.</p>
          </div>
          <button className="primary-btn" onClick={() => reset()}><RotateCcw size={15} /> NEW ROUND</button>
          <button className="text-btn ttt-race-link" onClick={onBack}>BACK TO REDLINE <span>→</span></button>
        </aside>
      </div>
    </section>
  );
}
