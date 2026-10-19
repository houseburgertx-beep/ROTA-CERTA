import React, { useState, useRef, useEffect, useCallback } from "react";
import { Bike, Check, ChevronRight } from "lucide-react";

interface SwipeToDeliverProps {
  onConfirm: () => void;
  label?: string;
  completedLabel?: string;
  disabled?: boolean;
}

export const SwipeToDeliver: React.FC<SwipeToDeliverProps> = ({
  onConfirm,
  label = "Deslize para Concluir",
  completedLabel = "Entrega Concluída!",
  disabled = false,
}) => {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);

  const getMaxDrag = useCallback(() => {
    if (!trackRef.current) return 0;
    const trackWidth = trackRef.current.clientWidth;
    const thumbWidth = thumbRef.current?.clientWidth || 46;
    return Math.max(0, trackWidth - thumbWidth - 4); // 4px padding
  }, []);

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDraggingRef.current || isCompleted || disabled) return;
    const delta = clientX - startXRef.current;
    const maxDrag = getMaxDrag();
    const newX = Math.max(0, Math.min(delta, maxDrag));
    setDragX(newX);
  }, [disabled, getMaxDrag, isCompleted]);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current || isCompleted || disabled) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const maxDrag = getMaxDrag();
    // Limite de 75% para disparar a conclusão
    if (maxDrag > 0 && dragX >= maxDrag * 0.75) {
      setDragX(maxDrag);
      setIsCompleted(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate([40, 60, 40]);
        } catch {
          // ignore
        }
      }
      setTimeout(() => {
        onConfirm();
      }, 250);
    } else {
      // Retorna com mola
      setDragX(0);
    }
  }, [disabled, dragX, getMaxDrag, isCompleted, onConfirm]);

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || isCompleted) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.touches[0].clientX - dragX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientX);
  };

  const onTouchEnd = () => {
    handleDragEnd();
  };

  // Pointer / Mouse handlers
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || isCompleted || e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.clientX - dragX;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    handleDragMove(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    handleDragEnd();
  };

  // Fallback reset if disabled changes
  useEffect(() => {
    if (disabled) {
      setDragX(0);
      setIsDragging(false);
      setIsCompleted(false);
    }
  }, [disabled]);

  const maxDrag = getMaxDrag();
  const progressRatio = maxDrag > 0 ? Math.min(1, dragX / maxDrag) : 0;

  return (
    <div
      ref={trackRef}
      className={`swipe-track ${isCompleted ? "is-completed" : ""} ${isDragging ? "is-dragging" : ""} ${disabled ? "is-disabled" : ""}`}
      style={{
        position: "relative",
        height: "48px",
        borderRadius: "99px",
        overflow: "hidden",
        userSelect: "none",
        touchAction: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Background Fill que acompanha o slider */}
      <div
        className="swipe-fill"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `calc(${dragX}px + 46px)`,
          transition: isDragging ? "none" : "width 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)",
          pointerEvents: "none",
        }}
      />

      {/* Texto ao centro */}
      <div
        className="swipe-label"
        style={{
          opacity: isCompleted ? 1 : Math.max(0.15, 1 - progressRatio * 1.5),
          transition: "opacity 0.15s ease",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontWeight: 700,
          fontSize: "13px",
          letterSpacing: "-0.2px",
          zIndex: 2,
        }}
      >
        {isCompleted ? (
          <>
            <Check size={16} strokeWidth={3} />
            <span>{completedLabel}</span>
          </>
        ) : (
          <>
            <span>{label}</span>
            <div className="swipe-chevrons" style={{ display: "inline-flex", opacity: 0.7 }}>
              <ChevronRight size={14} strokeWidth={2.5} />
              <ChevronRight size={14} strokeWidth={2.5} style={{ marginLeft: "-6px" }} />
            </div>
          </>
        )}
      </div>

      {/* Thumb / Botão deslizante */}
      <div
        ref={thumbRef}
        className="swipe-thumb"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={handleDragEnd}
        style={{
          position: "absolute",
          left: "3px",
          width: "42px",
          height: "42px",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          cursor: disabled ? "not-allowed" : "grab",
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? "none" : "transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)",
          zIndex: 3,
        }}
      >
        {isCompleted ? (
          <Check size={18} strokeWidth={3} className="swipe-thumb-icon done" />
        ) : (
          <Bike size={19} strokeWidth={2.4} className="swipe-thumb-icon" />
        )}
      </div>
    </div>
  );
};
