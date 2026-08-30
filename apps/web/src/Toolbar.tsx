import { useState, useCallback, useRef } from 'react';
import type { ToolType } from '@whiteboard/core';
import { useMediaQuery } from './useMediaQuery';
import ColorPalette from './ColorPalette';
import StrokeWidthSlider from './StrokeWidthSlider';
import Toggle from './Toggle';

interface ToolbarProps {
  tool: ToolType;
  onToolChange: (tool: ToolType) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  arrowStart: boolean;
  arrowEnd: boolean;
  onArrowStartChange: (v: boolean) => void;
  onArrowEndChange: (v: boolean) => void;
  snapEnabled: boolean;
  onSnapToggle: () => void;
}

const TOOLS: { type: ToolType; label: string; icon: string }[] = [
  { type: 'pan', label: 'Pan', icon: '🖐' },
  { type: 'select', label: 'Select', icon: '↖' },
  { type: 'draw', label: 'Draw', icon: '✏️' },
  { type: 'rectangle', label: 'Rectangle', icon: '▭' },
  { type: 'ellipse', label: 'Ellipse', icon: '⬭' },
  { type: 'arrow', label: 'Arrow', icon: '→' },
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'sticky', label: 'Sticky note (N)', icon: '▧' },
  { type: 'image', label: 'Image', icon: '🖼' },
];

const TOOLS_WITH_COLOR: ToolType[] = ['draw', 'rectangle', 'ellipse', 'arrow'];
const TOOLS_WITH_STROKE: ToolType[] = ['draw', 'rectangle', 'ellipse', 'arrow'];

export default function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  arrowStart,
  arrowEnd,
  onArrowStartChange,
  onArrowEndChange,
  snapEnabled,
  onSnapToggle,
}: ToolbarProps) {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [expanded, setExpanded] = useState<ToolType | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  const handleToolSelect = useCallback((t: ToolType) => {
    if (navigator.vibrate) navigator.vibrate(10);
    onToolChange(t);
  }, [onToolChange]);

  const handleTouchStart = useCallback((t: ToolType) => {
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      setExpanded(t);
      if (navigator.vibrate) navigator.vibrate(10);
    }, 500);
  }, []);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((t: ToolType) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!touchMoved.current) {
      handleToolSelect(t);
      if (isMobile && TOOLS_WITH_COLOR.includes(t)) {
        setExpanded(t);
      } else {
        setExpanded(null);
      }
    }
  }, [handleToolSelect, isMobile]);

  const showColorPalette = expanded && TOOLS_WITH_COLOR.includes(expanded);
  const showStrokeSlider = expanded && TOOLS_WITH_STROKE.includes(expanded);
  const showArrowToggles = expanded === 'arrow';

  return (
    <div className="toolbar-container">
      {expanded && (
        <div className="tool-options">
          {showColorPalette && <ColorPalette selected={color} onSelect={onColorChange} />}
          {showStrokeSlider && <StrokeWidthSlider value={strokeWidth} onChange={onStrokeWidthChange} />}
          {showArrowToggles && (
            <div className="arrow-toggles">
              <Toggle label="Start ↗" value={arrowStart} onChange={onArrowStartChange} />
              <Toggle label="End ↘" value={arrowEnd} onChange={onArrowEndChange} />
            </div>
          )}
        </div>
      )}
      <div className="toolbar" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => (
          <button
            key={t.type}
            className={tool === t.type ? 'active' : ''}
            onClick={() => handleToolSelect(t.type)}
            onTouchStart={() => handleTouchStart(t.type)}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => handleTouchEnd(t.type)}
            onContextMenu={(e) => {
              e.preventDefault();
              setExpanded(expanded === t.type ? null : t.type);
            }}
            aria-pressed={tool === t.type}
            aria-label={t.label}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
        <div className="divider" />
        {!isMobile && (
          <>
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              title="Color"
            />
            <input
              type="range"
              min={1}
              max={20}
              value={strokeWidth}
              onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
              title="Stroke width"
            />
          </>
        )}
        <div className="divider" />
        <button
          className={snapEnabled ? 'active' : ''}
          onClick={onSnapToggle}
          title={snapEnabled ? 'Grid snap: ON' : 'Grid snap: OFF'}
        >
          ⊞
        </button>
      </div>
    </div>
  );
}
