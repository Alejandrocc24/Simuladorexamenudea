import React, { useRef, useState, useEffect } from 'react';
import { Pen, Eraser, RotateCcw, Trash2, Download } from 'lucide-react';
import { cn } from './Layout';
import { ConfirmModal } from './ConfirmModal';

const MAX_HISTORY = 20;

export function Whiteboard({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'erase'>('draw');
  const [color, setColor] = useState('#10b981'); // emerald-500
  const [lineWidth, setLineWidth] = useState(3);
  const [showClearModal, setShowClearModal] = useState(false);
  
  // History for undo with max limit to prevent memory exhaustion
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas dimensions to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      // Only resize if different to avoid clearing (unless it's the first time)
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        // Save current drawing
        const ctx = canvas.getContext('2d');
        let currentDrawing: ImageData | null = null;
        if (ctx && canvas.width > 0) {
          currentDrawing = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        // Restore context defaults and drawing
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.fillStyle = '#ffffff'; // White background for export
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          if (currentDrawing) {
             ctx.putImageData(currentDrawing, 0, 0);
          } else {
             saveState(); // Save initial blank state
          }
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let newHistory = history.slice(0, historyStep + 1);
    newHistory.push(data);
    if (newHistory.length > MAX_HISTORY) {
      newHistory = newHistory.slice(newHistory.length - MAX_HISTORY);
    }
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY;

    ctx.lineTo(x, y);
    ctx.strokeStyle = mode === 'erase' ? '#ffffff' : color;
    ctx.lineWidth = mode === 'erase' ? lineWidth * 4 : lineWidth;
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.putImageData(history[newStep], 0, 0);
        setHistoryStep(newStep);
      }
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      saveState();
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'pizarra-udea.png';
      a.click();
    }
  };

  return (
    <div className={cn("flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in", className ?? "h-[calc(100vh-8rem)]")}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
          <button 
            onClick={() => setMode('draw')}
            className={cn("p-2 rounded-md transition-colors", mode === 'draw' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700")}
            title="Lápiz"
          >
            <Pen className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setMode('erase')}
            className={cn("p-2 rounded-md transition-colors", mode === 'erase' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700")}
            title="Borrador"
          >
            <Eraser className="w-5 h-5" />
          </button>
        </div>

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700 hidden sm:block"></div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase">Color</span>
          <div className="flex gap-1">
            {['#111827', '#10b981', '#3b82f6', '#ef4444', '#eab308'].map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setMode('draw'); }}
                className={cn(
                  "w-6 h-6 rounded-full cursor-pointer transition-transform border-2",
                  color === c && mode === 'draw' ? "scale-110 border-gray-400 dark:border-white shadow-sm" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700 hidden sm:block"></div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase">Grosor</span>
          <input 
            type="range" 
            min="1" max="20" 
            value={lineWidth} 
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="w-24 accent-emerald-500"
          />
        </div>

        <div className="flex-1"></div>

        <div className="flex items-center gap-2">
          <button onClick={handleUndo} disabled={historyStep <= 0} className="p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 transition-colors" title="Deshacer">
            <RotateCcw className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowClearModal(true)} 
            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" 
            title="Limpiar pizarra"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button onClick={handleDownload} className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors" title="Descargar">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title="¿Limpiar la pizarra?"
        message="Se borrarán todos los trazos y notas actuales de la pizarra. Esta acción no se puede deshacer."
        confirmLabel="Limpiar pizarra"
        onConfirm={() => {
          setShowClearModal(false);
          handleClear();
        }}
        onCancel={() => setShowClearModal(false)}
      />

      {/* Canvas Area */}
      <div 
        ref={containerRef} 
        className="flex-1 w-full bg-gray-100 cursor-crosshair overflow-hidden"
        style={{ touchAction: 'none' }} // Prevents scrolling on mobile when drawing
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="bg-white"
        />
      </div>
    </div>
  );
}
