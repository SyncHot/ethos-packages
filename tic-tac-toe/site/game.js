(() => {
    'use strict';

    const LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    const cells = Array.from(document.querySelectorAll('.cell'));
    const status = document.getElementById('status');
    const reset = document.getElementById('reset');
    const scoreX = document.getElementById('score-x');
    const scoreO = document.getElementById('score-o');
    const scoreDraw = document.getElementById('score-draw');

    let board = Array(9).fill('');
    let turn = 'X';
    let over = false;
    let scores = { X: 0, O: 0, draw: 0 };

    function winningLine() {
        return LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[b] === board[c]) || null;
    }

    function paint() {
        cells.forEach((cell, index) => {
            const value = board[index];
            cell.textContent = value;
            cell.classList.toggle('x', value === 'X');
            cell.classList.toggle('o', value === 'O');
            cell.disabled = over || Boolean(value);
            cell.setAttribute('aria-label', `Cell ${index + 1}${value ? `, ${value}` : ', empty'}`);
        });
        scoreX.textContent = String(scores.X);
        scoreO.textContent = String(scores.O);
        scoreDraw.textContent = String(scores.draw);
    }

    function finish(line, text) {
        over = true;
        if (line) line.forEach((index) => cells[index].classList.add('win'));
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
        cells.forEach((cell) => cell.classList.remove('win', 'x', 'o'));
        status.textContent = 'X to move';
        paint();
    }

    cells.forEach((cell) => cell.addEventListener('click', () => play(Number(cell.dataset.index))));
    reset.addEventListener('click', newRound);
    newRound();
})();
