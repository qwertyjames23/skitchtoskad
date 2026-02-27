interface Props {
  floors: number[];        // available floor numbers e.g. [1, 2, 3]
  activeFloor: number;
  onSelect: (floor: number) => void;
}

export function FloorSelector({ floors, activeFloor, onSelect }: Props) {
  if (floors.length <= 1) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 4,
        background: "rgba(255,255,255,0.9)",
        border: "1px solid #ccc",
        borderRadius: 6,
        padding: "4px 6px",
        zIndex: 20,
        pointerEvents: "auto",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        userSelect: "none",
      }}
    >
      {floors.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onSelect(f)}
          style={{
            padding: "3px 12px",
            border: "none",
            borderRadius: 4,
            background: f === activeFloor ? "#0078d4" : "transparent",
            color: f === activeFloor ? "#fff" : "#333",
            fontWeight: f === activeFloor ? 700 : 400,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Floor {f}
        </button>
      ))}
    </div>
  );
}
