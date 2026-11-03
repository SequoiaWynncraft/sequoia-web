export interface Wedge {
  startDeg: number;
  endDeg: number;
  midDeg: number;
}

export function wheelWedges(entrants: { tickets: number }[]): Wedge[] {
  const total = entrants.reduce((sum, entrant) => sum + Math.max(0, entrant.tickets), 0);
  if (total <= 0) return entrants.map(() => ({ startDeg: 0, endDeg: 0, midDeg: 0 }));
  let cursor = 0;
  return entrants.map((entrant) => {
    const size = (Math.max(0, entrant.tickets) / total) * 360;
    const wedge = { startDeg: cursor, endDeg: cursor + size, midDeg: cursor + size / 2 };
    cursor += size;
    return wedge;
  });
}

export function finalRotationDeg(wedges: Wedge[], winnerIndex: number, turns: number): number {
  const mid = wedges[winnerIndex]?.midDeg ?? 0;
  return turns * 360 + ((360 - (mid % 360)) % 360);
}

export function wedgePath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  // A single-wedge wheel spans the full circle, which an arc can't express -
  // draw it as two half-circle arcs instead.
  if (endDeg - startDeg >= 360) {
    const top = point(cx, cy, radius, 0);
    const bottom = point(cx, cy, radius, 180);
    return `M ${top.x} ${top.y} A ${radius} ${radius} 0 1 1 ${bottom.x} ${bottom.y} A ${radius} ${radius} 0 1 1 ${top.x} ${top.y} Z`;
  }
  const start = point(cx, cy, radius, startDeg);
  const end = point(cx, cy, radius, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

export function wedgeAtPointer(wedges: Wedge[], rotationDeg: number): number {
  if (wedges.length === 0) return -1;
  const angle = (((360 - rotationDeg) % 360) + 360) % 360;
  for (let index = 0; index < wedges.length; index++) {
    if (angle >= wedges[index].startDeg && angle < wedges[index].endDeg) return index;
  }
  return wedges.length - 1;
}

export function point(cx: number, cy: number, radius: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}
