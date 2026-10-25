import { focusHypothesisId, replay, thresholdOf, verdictOf } from '../domain/replay';
import { sensitivityReport } from '../domain/sensitivity';
import { assessSufficiency } from '../domain/sufficiency';
import type { Session } from '../domain/types';

export function derive(session: Session) {
  const r = replay(session);
  const focusId = focusHypothesisId(session);
  const focus = session.hypotheses.find((h) => h.id === focusId)!;
  const threshold = thresholdOf(session.decision);
  const verdict = verdictOf(r.final[focusId], threshold);
  const sens = sensitivityReport(session);
  const suff = assessSufficiency(session);
  const adopted = session.evidence.filter((e) => e.status === 'adopted');
  return { r, focusId, focus, threshold, verdict, sens, suff, adopted };
}

export type Derived = ReturnType<typeof derive>;
