/**
 * Core Audit Service & Data Aggregator.
 * Loads production state from PostgreSQL via Prisma, executing queries with full relation graphs.
 */

import { prisma } from '@/lib/db';
import { calculateEngagementProfitability, computeFirmTrialBalance } from '@/domain/profitability';
import { stratifyRisk } from '@/domain/materiality';
import { TRANSITIONS, type EngagementGateFacts } from '@/domain/lifecycle/state-machine';
import type { EngagementState } from '@/domain/lifecycle/states';

export async function getFullEngagementState(engagementId?: string) {
  // If no ID is passed, find the active engagement (Doha Pearl)
  const engagement = engagementId
    ? await prisma.engagement.findUnique({
        where: { id: engagementId },
        include: {
          client: { include: { contacts: true, parentClient: true, subsidiaries: true } },
          dualKeyGate: true,
          materiality: { orderBy: { revision: 'desc' }, take: 1 },
          acceptance: true,
          folders: { orderBy: { folderKey: 'asc' } },
          fsliItems: {
            include: {
              workPrograms: {
                include: {
                  procedures: {
                    include: {
                      evidence: { include: { document: true } },
                      reviewNotes: { include: { raisedBy: true, clearedBy: true } }
                    }
                  }
                }
              }
            },
            orderBy: { code: 'asc' }
          },
          trialBalanceRows: { orderBy: { accountCode: 'asc' } },
          confirmations: { orderBy: { dueAt: 'asc' } },
          pbcRequests: {
            include: { assignedContact: true, uploads: { include: { document: true } } },
            orderBy: { dueAt: 'asc' }
          },
          timeEntries: { include: { user: true }, orderBy: { date: 'desc' } },
          staffing: { orderBy: { phase: 'asc' } },
          deliverableSets: {
            include: { artifacts: { include: { document: true } }, opinionSelection: true },
            orderBy: { revision: 'desc' }
          },
          opinionSelections: { orderBy: { revision: 'desc' } }
        }
      })
    : await prisma.engagement.findFirst({
        include: {
          client: { include: { contacts: true, parentClient: true, subsidiaries: true } },
          dualKeyGate: true,
          materiality: { orderBy: { revision: 'desc' }, take: 1 },
          acceptance: true,
          folders: { orderBy: { folderKey: 'asc' } },
          fsliItems: {
            include: {
              workPrograms: {
                include: {
                  procedures: {
                    include: {
                      evidence: { include: { document: true } },
                      reviewNotes: { include: { raisedBy: true, clearedBy: true } }
                    }
                  }
                }
              }
            },
            orderBy: { code: 'asc' }
          },
          trialBalanceRows: { orderBy: { accountCode: 'asc' } },
          confirmations: { orderBy: { dueAt: 'asc' } },
          pbcRequests: {
            include: { assignedContact: true, uploads: { include: { document: true } } },
            orderBy: { dueAt: 'asc' }
          },
          timeEntries: { include: { user: true }, orderBy: { date: 'desc' } },
          staffing: { orderBy: { phase: 'asc' } },
          deliverableSets: {
            include: { artifacts: { include: { document: true } }, opinionSelection: true },
            orderBy: { revision: 'desc' }
          },
          opinionSelections: { orderBy: { revision: 'desc' } }
        }
      });

  const clients = await prisma.client.findMany({
    include: {
      contacts: true,
      subsidiaries: true,
      proposals: { include: { lineItems: true } }
    },
    orderBy: { legalName: 'asc' }
  });

  const users = await prisma.user.findMany({
    orderBy: { role: 'asc' }
  });

  const practiceLedger = await prisma.firmLedgerEntry.findMany({
    include: { lines: true },
    orderBy: { date: 'asc' }
  });

  const leads = await prisma.lead.findMany({
    orderBy: { capturedAt: 'desc' }
  });

  return {
    engagement,
    clients,
    users,
    practiceLedger,
    leads
  };
}

/**
 * Executes an engagement state transition if all gatekeeper checks pass.
 */
export async function attemptStateTransition(
  engagementId: string,
  targetState: EngagementState,
  actorUserId: string
) {
  const eng = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      client: { include: { contacts: true } },
      dualKeyGate: true,
      materiality: { orderBy: { revision: 'desc' }, take: 1 },
      fsliItems: {
        include: {
          workPrograms: {
            include: {
              procedures: {
                include: { reviewNotes: true }
              }
            }
          }
        }
      },
      confirmations: true,
      deliverableSets: true,
      opinionSelections: true
    }
  });

  if (!eng) throw new Error('Engagement not found.');

  const transition = TRANSITIONS.find(t => t.from === eng.state && t.to === targetState);
  if (!transition) {
    throw new Error(`Invalid transition from ${eng.state} to ${targetState}.`);
  }

  // Aggregate facts
  const procedures = eng.fsliItems.flatMap(f => f.workPrograms.flatMap(wp => wp.procedures));
  const openNotes = procedures.flatMap(p => p.reviewNotes).filter(n => n.status === 'OPEN').length;
  const criticalOutstanding = eng.confirmations.filter(c => c.critical && c.status !== 'RECEIVED' && c.status !== 'CLEARED').length;

  const facts: EngagementGateFacts = {
    entityProfileComplete: Boolean(eng.client.crNumber && eng.client.tin),
    primaryContactDefined: eng.client.contacts.some(c => c.isPrimary),
    contactRoutingComplete: eng.client.contacts.length >= 2,
    proposalDispatchedVia: 'Email',
    dualKey: {
      key1ClientApproval: Boolean(eng.dualKeyGate?.key1Approved),
      key2PartnerClearance: Boolean(eng.dualKeyGate?.key2Approved)
    },
    advance: {
      requiredQar: Number(eng.advanceRequiredQar ?? 60000),
      recordedQar: Number(eng.advanceRecordedQar ?? 0),
      receiptDocumentId: eng.advanceReceiptDocumentId
    },
    planningSignedOffByPartner: Boolean(eng.materiality[0]?.approvedByUserId),
    tbMappedToFslis: eng.fsliItems.length > 0,
    fieldProcedures: {
      total: procedures.length,
      submitted: procedures.filter(p => p.status === 'SUBMITTED' || p.status === 'CLEARED').length
    },
    review: {
      openNotes,
      srmCompiled: true
    },
    confirmations: {
      criticalOutstanding
    },
    partnerApproval: {
      signatureApplied: eng.opinionSelections.some(o => o.signatureApplied),
      opinionSelected: eng.opinionSelections.length > 0,
      redRiskAreasCleared: true
    },
    release: {
      packageGenerated: eng.deliverableSets.length > 0,
      deliveredToClient: Boolean(eng.deliverableSets[0]?.deliveredAt)
    },
    archive: {
      signatureDate: eng.signatureDate?.toISOString() ?? null,
      daysSinceSignature: 0,
      manualLock: false
    }
  };

  const violations = transition.check(facts);
  if (violations.length > 0) {
    return { success: false, violations };
  }

  // Update engagement state in database
  const updated = await prisma.engagement.update({
    where: { id: engagementId },
    data: { state: targetState }
  });

  return { success: true, newState: updated.state, violations: [] };
}
