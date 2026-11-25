export type OpsSnapshot = {
  readyDown: boolean;
  failed: number;
  stuck: number;
};

export const OPS_ALERT_QUIET_MS = 24 * 60 * 60 * 1000;

export type OpsNotice = {
  snapshot: OpsSnapshot;
  at: number;
};

/** True when something is wrong and the last notice is stale or a count rose. */
export function shouldNotify(previous: OpsNotice | null, current: OpsSnapshot, now: number): boolean {
  if (!current.readyDown && current.failed === 0 && current.stuck === 0) {
    return false;
  }
  if (!previous) {
    return true;
  }
  if (now - previous.at >= OPS_ALERT_QUIET_MS) {
    return true;
  }
  if (current.failed > previous.snapshot.failed) {
    return true;
  }
  if (current.stuck > previous.snapshot.stuck) {
    return true;
  }
  if (current.readyDown && !previous.snapshot.readyDown) {
    return true;
  }
  return false;
}

export function opsSignature(snapshot: OpsSnapshot): string {
  const parts: string[] = [];
  if (snapshot.readyDown) {
    parts.push("ready");
  }
  if (snapshot.failed > 0) {
    parts.push(`failed:${snapshot.failed}`);
  }
  if (snapshot.stuck > 0) {
    parts.push(`stuck:${snapshot.stuck}`);
  }
  return parts.join(" ");
}

export function opsMessage(snapshot: OpsSnapshot): string {
  return [
    "Aviso de operaciones.",
    `Listo: ${snapshot.readyDown ? "no" : "sí"}`,
    `Certificados fallidos: ${snapshot.failed}`,
    `Pendientes atascados: ${snapshot.stuck}`,
    "Revisar la ficha del evento / retry-issue.",
  ].join("\n");
}
