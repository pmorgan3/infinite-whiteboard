import { useState } from 'react';
import type { BoardRecord } from './storage/boards';

interface BoardManagerProps {
  boards: BoardRecord[];
  activeBoardId: string;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function BoardManager(props: BoardManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const startRename = (board: BoardRecord) => {
    setEditingId(board.id);
    setName(board.name);
  };

  const finishRename = () => {
    if (!editingId) return;
    props.onRename(editingId, name);
    setEditingId(null);
  };

  return (
    <div className="board-manager">
      <button className="board-create" onClick={props.onCreate}>New board</button>
      <div className="board-list">
        {props.boards.map((board) => (
          <div className={`board-row ${board.id === props.activeBoardId ? 'active' : ''}`} key={board.id}>
            <div className="board-details">
              {editingId === board.id ? (
                <input
                  aria-label="Board name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') finishRename();
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button className="board-open" onClick={() => props.onOpen(board.id)}>
                  <strong>{board.name}</strong>
                  <time dateTime={board.updatedAt}>{new Date(board.updatedAt).toLocaleString()}</time>
                </button>
              )}
            </div>
            <div className="board-actions">
              <button aria-label={`Rename ${board.name}`} title="Rename" onClick={() => startRename(board)}>✏️</button>
              <button aria-label={`Duplicate ${board.name}`} title="Duplicate" onClick={() => props.onDuplicate(board.id)}>⧉</button>
              <button aria-label={`Delete ${board.name}`} title="Delete" onClick={() => props.onDelete(board.id)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
