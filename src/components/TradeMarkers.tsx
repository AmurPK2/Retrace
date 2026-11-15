import type { Session } from "../types";
import { tradeMarkers } from "../core/trade-markers";

export function TradeMarkers({
  session,
  x,
  y,
}: {
  session: Session;
  x: (time: number) => number;
  y: (price: number) => number;
}) {
  const { arrows, links } = tradeMarkers(session);
  return (
    <g className="trade-history-markers" aria-label="Trade entries and exits">
      {links.map((link) => (
        <line
          key={`link:${link.id}`}
          x1={x(link.from.time)}
          y1={y(link.from.price)}
          x2={x(link.to.time)}
          y2={y(link.to.price)}
          stroke={link.side === "buy" ? "#59aaff" : "#f07878"}
          strokeWidth="1.2"
          strokeDasharray="4 4"
          opacity=".65"
          pointerEvents="none"
        />
      ))}
      {arrows.map((marker) => {
        const px = x(marker.time),
          py = y(marker.price);
        const up = marker.side === "buy";
        const color = up ? "#59aaff" : "#f07878";
        return (
          <g
            key={marker.id}
            data-trade-marker={marker.kind}
            data-trade-id={marker.tradeId}
            role="img"
            aria-label={marker.label}
          >
            <title>{marker.label}</title>
            <path
              d={
                up
                  ? `M ${px} ${py} l -6 10 h 4 v 6 h 4 v -6 h 4 Z`
                  : `M ${px} ${py} l -6 -10 h 4 v -6 h 4 v 6 h 4 Z`
              }
              fill={color}
              stroke="#10151c"
              strokeWidth="1.8"
            />
            <text
              x={px + 9}
              y={py + (up ? 17 : -10)}
              fill={color}
              fontSize="10"
              paintOrder="stroke"
              stroke="#10151c"
              strokeWidth="2"
            >
              {marker.kind === "entry" ? marker.side.toUpperCase() : "EXIT"}
            </text>
          </g>
        );
      })}
    </g>
  );
}
