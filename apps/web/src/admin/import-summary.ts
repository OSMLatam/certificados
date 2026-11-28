export function importSummary(participantCount: number, certificateCount: number): string {
  const people = `${participantCount} ${participantCount === 1 ? "participante" : "participantes"}`;
  const certificates = `${certificateCount} ${certificateCount === 1 ? "certificado" : "certificados"}`;
  return `Se importaron ${people}, ${certificates}.`;
}
