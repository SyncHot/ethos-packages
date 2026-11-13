// EthOS native package UI — Tic-Tac-Toe
// Contract: export function render(container, ctx) and render into container.

const STYLE = `
.ttt-root {
    --ttt-bg: #0b1220;
    --ttt-panel: rgba(148, 163, 184, 0.08);
    --ttt-border: rgba(148, 163, 184, 0.22);
    --ttt-text: #e2e8f0;
    --ttt-muted: #94a3b8;
    --ttt-accent: #38bdf8;
    --ttt-x: #f87171;
    --ttt-o: #4ade80;
    height: 100%;
    overflow: auto;
    display: grid;
    place-items: center;
    padding: 28px;
    box-sizing: border-box;
    background:
        radial-gradient(circle at 12% 8%, rgba(56, 189, 248, 0.16), transparent 42%),
        radial-gradient(circle at 88% 92%, rgba(248, 113, 113, 0.13), transparent 42%),
        var(--ttt-bg);
    color: var(--ttt-text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    text-align: center;
}
.ttt-card {
    width: min(500px, 100%);
    padding: 28px;
    border: 1px solid var(--ttt-border);
    border-radius: 22px;
    background: var(--ttt-panel);
}
.ttt-mark { font-size: 22px; letter-spacing: 6px; }
.ttt-root h1 { margin: 8px 0 6px; font-size: clamp(28px, 6vw, 38px); letter-spacing: -0.03em; }
.ttt-lead { margin: 0 0 20px; color: var(--ttt-muted); font-size: 13px; }
.ttt-score { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
.ttt-score div { padding: 10px; border: 1px solid var(--ttt-border); border-radius: 10px; background: rgba(15, 23, 42, 0.35); }
.ttt-score span { display: block; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ttt-muted); margin-bottom: 4px; }
.ttt-score strong { font-size: 20px; font-variant-numeric: tabular-nums; }
.ttt-status { min-height: 24px; margin: 0 0 14px; font-size: 14px; font-weight: 600; color: var(--ttt-accent); }
.ttt-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
.ttt-cell {
    aspect-ratio: 1;
    border: 1px solid var(--ttt-border);
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.55);
    color: var(--ttt-text);
    font-size: clamp(38px, 13vw, 62px);
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
.ttt-cell:hover:not(:disabled) { border-color: var(--ttt-accent); background: rgba(56, 189, 248, 0.08); transform: translateY(-1px); }
.ttt-cell:focus-visible, .ttt-reset:focus-visible { outline: 2px solid var(--ttt-accent); outline-offset: 2px; }
.ttt-cell.ttt-x { color: var(--ttt-x); }
.ttt-cell.ttt-o { color: var(--ttt-o); }
.ttt-cell:disabled { cursor: default; }
.ttt-cell.ttt-win { border-color: var(--ttt-accent); box-shadow: inset 0 0 0 2px rgba(56, 189, 248, 0.35); background: rgba(56, 189, 248, 0.14); }
.ttt-reset {
    padding: 10px 22px;
    border: 1px solid rgba(56, 189, 248, 0.5);
    border-radius: 10px;
    background: rgba(56, 189, 248, 0.12);
    color: var(--ttt-text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}
.ttt-reset:hover { background: rgba(56, 189, 248, 0.2); }
.ttt-foot { margin-top: 18px; font-size: 11px; color: var(--ttt-muted); }
`;

const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

export function render(container, ctx) {
    container.replaceChildren();
    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'ttt-root';
    root.innerHTML = `
        <div class="ttt-card">
            <div class="ttt-mark" aria-hidden="true">❌ ⭕</div>
            <h1>Tic-Tac-Toe</h1>
            <p class="ttt-lead">Two players, one board. X starts.</p>
            <div class="ttt-score" aria-label="Score">
                <div><span>X</span><strong data-score="X">0</strong></div>
                <div><span>Draws</span><strong data-score="draw">0</strong></div>
                <div><span>O</span><strong data-score="O">0</strong></div>
            </div>
            <p class="ttt-status" role="status" aria-live="polite">X to move</p>
            <div class="ttt-board" role="grid" aria-label="Tic-tac-toe board">
                ${Array.from({ length: 9 }, (_, i) =>
                    `<button class="ttt-cell" data-index="${i}" role="gridcell" aria-label="Cell ${i + 1}"></button>`).join('')}
            </div>
            <button class="ttt-reset" type="button">New round</button>
            <p class="ttt-foot">Native EthOS package UI · v${String(ctx?.pkg?.version || '2.0.0')}</p>
        </div>`;
    container.append(style, root);

    const cells = Array.from(root.querySelectorAll('.ttt-cell'));
    const status = root.querySelector('.ttt-status');
    const reset = root.querySelector('.ttt-reset');
    const scores = { X: 0, O: 0, draw: 0 };
    let board = Array(9).fill('');
    let turn = 'X';
    let over = false;

    const winningLine = () => LINES.find(([a, b, c]) =>
        board[a] && board[a] === board[b] && board[b] === board[c]) || null;

    function paint() {
        cells.forEach((cell, index) => {
            const value = board[index];
            cell.textContent = value;
            cell.classList.toggle('ttt-x', value === 'X');
            cell.classList.toggle('ttt-o', value === 'O');
            cell.disabled = over || Boolean(value);
            cell.setAttribute('aria-label', `Cell ${index + 1}${value ? `, ${value}` : ', empty'}`);
        });
        for (const [key, value] of Object.entries(scores)) {
            const el = root.querySelector(`[data-score="${key}"]`);
            if (el) el.textContent = String(value);
        }
    }

    function finish(line, text) {
        over = true;
        if (line) line.forEach((index) => cells[index].classList.add('ttt-win'));
        status.textContent = text;
        paint();
    }

    function play(index) {
        if (over || board[index]) return;
        board[index] = turn;
        const line = winningLine();
        if (line) {
            scores[turn] += 1;
            finish(line, `${turn} wins!`);
            return;
        }
        if (board.every(Boolean)) {
            scores.draw += 1;
            finish(null, "It's a draw");
            return;
        }
        turn = turn === 'X' ? 'O' : 'X';
        status.textContent = `${turn} to move`;
        paint();
    }

    function newRound() {
        board = Array(9).fill('');
        turn = 'X';
        over = false;
        cells.forEach((cell) => cell.classList.remove('ttt-win', 'ttt-x', 'ttt-o'));
        status.textContent = 'X to move';
        paint();
    }

    cells.forEach((cell) => cell.addEventListener('click', () => play(Number(cell.dataset.index))));
    reset.addEventListener('click', newRound);
    newRound();
}
