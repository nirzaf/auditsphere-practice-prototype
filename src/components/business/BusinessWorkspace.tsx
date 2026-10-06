import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  BusinessActorProfile,
  BusinessClientDetail,
  BusinessClientSummary,
  BusinessContextResponse,
  BusinessFileMediaType,
  BusinessFileMetadata,
  BusinessFilePurpose,
  BusinessLead,
  BusinessPersona,
  BusinessProposal,
  BusinessProposalWorkspace,
  BusinessStandardsProfile,
  BusinessWorkspacePreference,
  BusinessWorkspaceSummary,
  StaffGrade
} from '../../shared/api/business';
import {
  businessWorkspaceSnapshot,
  clearBusinessWorkspacePreference,
  createBusinessWorkspace,
  completeBusinessFile,
  downloadBusinessFile,
  getBusinessFiles,
  getBusinessActorProfiles,
  getBusinessClient,
  getBusinessClients,
  getBusinessContext,
  getBusinessLeads,
  getBusinessProposalWorkspace,
  getBusinessStandardsProfiles,
  getBusinessWorkspace,
  initializeBusinessFile,
  newBusinessIdempotencyKey,
  runBusinessCommand,
  saveBusinessWorkspacePreference,
  selectBusinessActor,
  subscribeBusinessWorkspace,
  uploadBusinessFile
} from '../../services/businessWorkspace';
import './business-workspace.css';
import { BusinessAcceptanceRiskPanel } from './BusinessAcceptanceRiskPanel';
import { BusinessDeliveryPanel } from './BusinessDeliveryPanel';
import { BusinessPbcPanel } from './BusinessPbcPanel';
import { BusinessPlanningPanel } from './BusinessPlanningPanel';
import { BusinessTrialBalancePanel } from './BusinessTrialBalancePanel';

type SetupMode = 'create' | 'connect';

export function BusinessWorkspaceSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<SetupMode>('create');
  const [workspaceName, setWorkspaceName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [naturalPersonKey, setNaturalPersonKey] = useState('');
  const [email, setEmail] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const createKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
  }, [open]);

  if (!open) return null;

  const clearKey = () => { createKey.current = undefined; };
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      createKey.current ??= newBusinessIdempotencyKey();
      const created = await createBusinessWorkspace({
        name: workspaceName,
        currency: 'QAR',
        timezone: 'Asia/Qatar',
        initialPartner: { displayName: partnerName, naturalPersonKey, email }
      }, createKey.current);
      saveBusinessWorkspacePreference({
        version: 1,
        workspaceId: created.workspaceId,
        actorId: created.actorProfileId,
        persona: 'APPROVER'
      });
      createKey.current = undefined;
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The workspace could not be created. Retry the request.');
    } finally {
      setBusy(false);
    }
  };

  const connect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const id = workspaceId.trim();
      const [workspace, profiles] = await Promise.all([
        getBusinessWorkspace(id),
        getBusinessActorProfiles(id)
      ]);
      const firstProfile = profiles[0];
      saveBusinessWorkspacePreference({
        version: 1,
        workspaceId: workspace.id,
        ...(firstProfile ? { actorId: firstProfile.id, persona: firstProfile.persona } : {})
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The workspace could not be opened. Check the ID and retry.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-overlay business-setup-overlay" role="presentation" data-dismiss-guard="self" onClick={event => {
    // The shared app Escape handler dispatches an untrusted click on the active
    // backdrop. Ignore pointer backdrop clicks so setup fields are not discarded.
    if (event.target === event.currentTarget && event.detail === 0) onClose();
  }}>
    <section className="modal-card business-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="business-setup-title" aria-describedby="business-setup-description">
      <div className="business-setup-head">
        <div>
          <p className="business-eyebrow">AUDITSPHERE · BUSINESS MODE</p>
          <h2 id="business-setup-title">Open a business workspace</h2>
          <p id="business-setup-description" className="business-muted">Business workspaces start empty and persist in the server database. Persona selection is self-asserted; it does not verify identity.</p>
        </div>
        <button className="btn sm" type="button" onClick={onClose}>Close</button>
      </div>

      <div className="business-mode-tabs" role="group" aria-label="Workspace action">
        <button type="button" className={mode === 'create' ? 'business-mode-tab selected' : 'business-mode-tab'} aria-pressed={mode === 'create'} onClick={() => { setMode('create'); setError(''); }}>Create workspace</button>
        <button type="button" className={mode === 'connect' ? 'business-mode-tab selected' : 'business-mode-tab'} aria-pressed={mode === 'connect'} onClick={() => { setMode('connect'); setError(''); }}>Connect by workspace ID</button>
      </div>

      {error && <p className="business-alert" role="alert">{error}</p>}

      {mode === 'create' ? <form className="business-form" onSubmit={create}>
        <label className="business-field" htmlFor="business-workspace-name">
          <span>Workspace name</span>
          <input id="business-workspace-name" autoComplete="organization" required minLength={1} maxLength={200} value={workspaceName} onChange={event => { clearKey(); setWorkspaceName(event.target.value); }} />
        </label>
        <div className="business-static-fields" aria-label="Workspace defaults">
          <div><span>Currency</span><strong>QAR</strong></div>
          <div><span>Timezone</span><strong>Asia/Qatar</strong></div>
        </div>
        <h3>Initial Partner directory record</h3>
        <div className="business-form-grid">
          <label className="business-field" htmlFor="business-partner-name">
            <span>Display name</span>
            <input id="business-partner-name" autoComplete="name" required maxLength={200} value={partnerName} onChange={event => { clearKey(); setPartnerName(event.target.value); }} />
          </label>
          <label className="business-field" htmlFor="business-partner-key">
            <span>Natural-person key</span>
            <input id="business-partner-key" autoComplete="off" required maxLength={200} value={naturalPersonKey} onChange={event => { clearKey(); setNaturalPersonKey(event.target.value); }} />
            <small>Firm-maintained unique reference used for independence checks.</small>
          </label>
          <label className="business-field" htmlFor="business-partner-email">
            <span>Email</span>
            <input id="business-partner-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => { clearKey(); setEmail(event.target.value); }} />
          </label>
        </div>
        <p className="business-note">This creates one Partner staff record and one APPROVER profile. It does not create clients, engagements, invoices, approvals, or payment history.</p>
        <div className="business-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Creating workspace…' : 'Create business workspace'}</button>
        </div>
      </form> : <form className="business-form" onSubmit={connect}>
        <label className="business-field" htmlFor="business-connect-id">
          <span>Workspace ID</span>
          <input id="business-connect-id" autoComplete="off" required minLength={36} maxLength={36} value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} />
          <small>The ID is a locator, not an access credential. This profile runs in a trusted environment.</small>
        </label>
        <p className="business-note">The browser will load configured profiles from the workspace and keep your selection in this browser only. No cookie, password, or access token is created.</p>
        <div className="business-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect workspace'}</button>
        </div>
      </form>}
    </section>
  </div>;
}

interface PendingStaffAssignment {
  staffMemberId: string;
  persona: Exclude<BusinessPersona, 'CLIENT'>;
  idempotencyKey: string;
  displayName: string;
}

function gradeAllowsPersona(grade: StaffGrade, persona: Exclude<BusinessPersona, 'CLIENT'>): boolean {
  if (persona === 'APPROVER') return grade === 'PARTNER';
  if (persona === 'REVIEWER') return grade === 'MANAGER' || grade === 'SENIOR';
  return true;
}

export function BusinessWorkspaceConsole() {
  const preference = useSyncExternalStore(subscribeBusinessWorkspace, businessWorkspaceSnapshot);
  const [workspace, setWorkspace] = useState<BusinessWorkspaceSummary | null>(null);
  const [profiles, setProfiles] = useState<BusinessActorProfile[]>([]);
  const [context, setContext] = useState<BusinessContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandMessage, setCommandMessage] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffNaturalKey, setStaffNaturalKey] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffGrade, setStaffGrade] = useState<StaffGrade>('ASSOCIATE');
  const [staffPersona, setStaffPersona] = useState<Exclude<BusinessPersona, 'CLIENT'>>('PREPARER');
  const [pendingAssignment, setPendingAssignment] = useState<PendingStaffAssignment | null>(null);
  const pendingCreate = useRef<{ idempotencyKey: string; naturalPersonKey: string; displayName: string; email: string; grade: StaffGrade } | null>(null);
  const [clients, setClients] = useState<BusinessClientSummary[]>([]);
  const [clientDetail, setClientDetail] = useState<BusinessClientDetail | null>(null);
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [standardsProfiles, setStandardsProfiles] = useState<BusinessStandardsProfile[]>([]);
  const [proposalWorkspace, setProposalWorkspace] = useState<BusinessProposalWorkspace | null>(null);
  const [proposalEngagementId, setProposalEngagementId] = useState('');
  const [riskEngagementId, setRiskEngagementId] = useState('');
  const [proposalMode, setProposalMode] = useState<'QUOTE' | 'FULL_PROPOSAL'>('QUOTE');
  const [proposalScope, setProposalScope] = useState('');
  const [proposalFeeMinor, setProposalFeeMinor] = useState('');
  const [proposalValidUntil, setProposalValidUntil] = useState('');
  const [proposalMilestoneName, setProposalMilestoneName] = useState('Planning and fieldwork');
  const [proposalMilestoneDate, setProposalMilestoneDate] = useState('');
  const [cvStaffMemberId, setCvStaffMemberId] = useState('');
  const [cvFileVersionId, setCvFileVersionId] = useState('');
  const [proposalRouteIds, setProposalRouteIds] = useState<Record<string, string>>({});
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [firmLegalName, setFirmLegalName] = useState('');
  const [firmRegistrationNumber, setFirmRegistrationNumber] = useState('');
  const [firmAddress, setFirmAddress] = useState('');
  const [firmProfileText, setFirmProfileText] = useState('');
  const [firmMethodologyText, setFirmMethodologyText] = useState('');
  const [files, setFiles] = useState<BusinessFileMetadata[]>([]);
  const [filePurpose, setFilePurpose] = useState<BusinessFilePurpose>('TEMPLATE');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMessage, setFileMessage] = useState('');
  const [fileError, setFileError] = useState('');
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [recordError, setRecordError] = useState('');
  const [recordsKey, setRecordsKey] = useState(0);
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientType, setClientType] = useState<'HOLDING' | 'SUBSIDIARY' | 'STANDALONE'>('STANDALONE');
  const [clientIndustry, setClientIndustry] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [primaryContactName, setPrimaryContactName] = useState('');
  const [primaryContactEmail, setPrimaryContactEmail] = useState('');
  const [primaryContactRole, setPrimaryContactRole] = useState<'MD_GM' | 'CFO_FINANCE_DIRECTOR' | 'CHIEF_ACCOUNTANT_LIAISON' | 'OTHER'>('CFO_FINANCE_DIRECTOR');
  const [leadSource, setLeadSource] = useState<'PHONE' | 'WHATSAPP' | 'EMAIL' | 'WEB_FORM' | 'REFERRAL'>('REFERRAL');
  const [leadClientMode, setLeadClientMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [leadClientCode, setLeadClientCode] = useState('');
  const [leadClientName, setLeadClientName] = useState('');
  const [leadClientIndustry, setLeadClientIndustry] = useState('');
  const [leadClientAddress, setLeadClientAddress] = useState('');
  const [leadContactName, setLeadContactName] = useState('');
  const [leadContactEmail, setLeadContactEmail] = useState('');
  const [leadContactPhone, setLeadContactPhone] = useState('');
  const [leadContactTitle, setLeadContactTitle] = useState('CFO / Finance Director');
  const [leadContactRole, setLeadContactRole] = useState<'MD_GM' | 'CFO_FINANCE_DIRECTOR' | 'CHIEF_ACCOUNTANT_LIAISON' | 'OTHER'>('CFO_FINANCE_DIRECTOR');
  const [leadService, setLeadService] = useState<'STATUTORY_AUDIT' | 'INTERNAL_AUDIT' | 'AGREED_UPON_PROCEDURES'>('STATUTORY_AUDIT');
  const [leadPeriodStart, setLeadPeriodStart] = useState('2026-01-01');
  const [leadPeriodEnd, setLeadPeriodEnd] = useState('2026-12-31');
  const [leadEstimatedFee, setLeadEstimatedFee] = useState('');
  const [standardsName, setStandardsName] = useState('');
  const [standardsStart, setStandardsStart] = useState('');
  const [standardsEnd, setStandardsEnd] = useState('');
  const [isa220Edition, setIsa220Edition] = useState('');
  const [isa570Edition, setIsa570Edition] = useState('');
  const [reportingFramework, setReportingFramework] = useState('');
  const [presentationEdition, setPresentationEdition] = useState<'IAS1' | 'IFRS18' | 'OTHER_APPROVED'>('IAS1');
  const [engagementCode, setEngagementCode] = useState('');
  const [contractFeeMinor, setContractFeeMinor] = useState('');
  const [createdEngagement, setCreatedEngagement] = useState<{ id: string; version: number; state: string } | null>(null);
  const businessCommandKeys = useRef(new Map<string, { signature: string; key: string }>());

  const selectedProfile = useMemo(
    () => profiles.find(profile => profile.id === preference?.actorId && profile.persona === preference?.persona) ?? null,
    [profiles, preference?.actorId, preference?.persona]
  );

  useEffect(() => {
    if (!preference?.workspaceId) {
      setWorkspace(null);
      setProfiles([]);
      setContext(null);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      getBusinessWorkspace(preference.workspaceId, controller.signal),
      getBusinessActorProfiles(preference.workspaceId, controller.signal)
    ]).then(([summary, items]) => {
      if (controller.signal.aborted) return;
      setWorkspace(summary);
      setProfiles(items);
      if (preference.actorId && !items.some(profile => profile.id === preference.actorId && profile.persona === preference.persona)) {
        saveBusinessWorkspacePreference({ version: 1, workspaceId: preference.workspaceId });
        setError('The previously selected profile is no longer active. Choose an available profile.');
      }
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Business workspace is unavailable. Retry the connection.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [preference?.workspaceId, retryKey]);

  useEffect(() => {
    if (!preference?.workspaceId || !preference.actorId || !preference.persona) {
      setContext(null);
      return;
    }
    const controller = new AbortController();
    setContext(null);
    getBusinessContext(preference.workspaceId, preference, controller.signal).then(next => {
      if (!controller.signal.aborted) setContext(next);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      if (reason && typeof reason === 'object' && 'code' in reason && ['DISABLED_IDENTITY', 'PERSONA_ACTION_DENIED'].includes(String(reason.code))) {
        saveBusinessWorkspacePreference({ version: 1, workspaceId: preference.workspaceId });
        setError('That profile is unavailable or does not match its persona. Select an active profile.');
      } else {
        setError(reason instanceof Error ? reason.message : 'The selected workspace context could not be loaded.');
      }
    });
    return () => controller.abort();
  }, [preference?.workspaceId, preference?.actorId, preference?.persona, preference?.clientId, preference?.engagementId]);

  useEffect(() => {
    if (!preference?.workspaceId || !preference.actorId || !context || context.actor.id !== preference.actorId) {
      setClients([]);
      setClientDetail(null);
      setLeads([]);
      setStandardsProfiles([]);
      return;
    }
    const controller = new AbortController();
    setRecordError('');
    const work: Array<Promise<unknown>> = [];
    const positions: Array<'clients' | 'leads' | 'standards'> = [];
    if (context.allowedActions.includes('client.read')) {
      positions.push('clients');
      work.push(getBusinessClients(preference.workspaceId, preference, controller.signal));
    }
    if (context.allowedActions.includes('lead.read')) {
      positions.push('leads');
      work.push(getBusinessLeads(preference.workspaceId, preference, controller.signal));
    }
    if (context.allowedActions.includes('standards.read')) {
      positions.push('standards');
      work.push(getBusinessStandardsProfiles(preference.workspaceId, preference, controller.signal));
    }
    Promise.all(work).then(results => {
      if (controller.signal.aborted) return;
      results.forEach((result, index) => {
        if (positions[index] === 'clients') setClients((result as { items: BusinessClientSummary[] }).items);
        if (positions[index] === 'leads') setLeads((result as { items: BusinessLead[] }).items);
        if (positions[index] === 'standards') setStandardsProfiles(result as BusinessStandardsProfile[]);
      });
    }).catch(reason => {
      if (!controller.signal.aborted) setRecordError(reason instanceof Error ? reason.message : 'Business records could not be loaded. Retry.');
    });
    return () => controller.abort();
  }, [preference?.workspaceId, preference?.actorId, preference?.persona, preference?.clientId, context?.actor.id, context?.allowedActions.join(','), recordsKey]);

  useEffect(() => {
    if (!preference?.workspaceId || !preference.actorId || !context?.allowedActions.includes('proposal.read')) {
      setProposalWorkspace(null);
      return;
    }
    const controller = new AbortController();
    getBusinessProposalWorkspace(preference.workspaceId, preference, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      setProposalWorkspace(next);
      setProposalEngagementId(current => current && next.engagements.some(item => item.id === current)
        ? current : next.engagements.find(item => item.lifecycleState === 'PROPOSAL_GENERATION')?.id ?? '');
      setRiskEngagementId(current => current && next.engagements.some(item => item.id === current)
        ? current : next.engagements.find(item => ['PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING'].includes(item.lifecycleState))?.id ?? '');
      setCvStaffMemberId(current => current || selectedProfile?.staffMemberId || next.staffMembers.find(staff => staff.grade === 'PARTNER')?.id || '');
      setCvFileVersionId(current => current || files.find(file => file.purpose === 'TEMPLATE'
        && ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mediaType))?.id || '');
      if (next.firmProfile) {
        setFirmLegalName(next.firmProfile.legalName);
        setFirmRegistrationNumber(next.firmProfile.registrationNumber);
        setFirmAddress(next.firmProfile.address);
        setFirmProfileText(next.firmProfile.profileText);
        setFirmMethodologyText(next.firmProfile.methodologyText);
      }
    }).catch(reason => {
      if (!controller.signal.aborted) setRecordError(reason instanceof Error ? reason.message : 'Proposal workspace could not be loaded.');
    });
    return () => controller.abort();
  }, [preference?.workspaceId, preference?.actorId, preference?.persona, preference?.clientId, preference?.engagementId, context?.actor.id, context?.allowedActions.join(','), recordsKey]);

  useEffect(() => {
    const pending = proposalWorkspace?.proposals.some(proposal => ['PENDING', 'RUNNING'].includes(proposal.documentStatus)
      || proposal.dispatchStatus === 'QUEUED');
    if (!pending) return;
    const timer = window.setInterval(() => setRecordsKey(value => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [proposalWorkspace]);

  useEffect(() => {
    if (!preference?.workspaceId || !preference.actorId || !context?.allowedActions.includes('file.read')) {
      setFiles([]);
      return;
    }
    const controller = new AbortController();
    getBusinessFiles(preference.workspaceId, preference, controller.signal).then(items => {
      if (!controller.signal.aborted) setFiles(items);
    }).catch(reason => {
      if (!controller.signal.aborted) setRecordError(reason instanceof Error ? reason.message : 'Stored files could not be loaded.');
    });
    return () => controller.abort();
  }, [preference?.workspaceId, preference?.actorId, preference?.persona, preference?.clientId, preference?.engagementId, context?.actor.id, context?.allowedActions.join(','), recordsKey]);

  useEffect(() => {
    if (!preference?.workspaceId || !preference.actorId || !preference.clientId || !context?.allowedActions.includes('client.read')) {
      setClientDetail(null);
      return;
    }
    const controller = new AbortController();
    getBusinessClient(preference.workspaceId, preference.clientId, preference, controller.signal).then(detail => {
      if (!controller.signal.aborted) setClientDetail(detail);
    }).catch(reason => {
      if (!controller.signal.aborted) {
        setClientDetail(null);
        setRecordError(reason instanceof Error ? reason.message : 'The selected client could not be loaded.');
      }
    });
    return () => controller.abort();
  }, [preference?.workspaceId, preference?.actorId, preference?.persona, preference?.clientId, context?.actor.id, recordsKey]);

  const refreshProfiles = async () => {
    if (!preference?.workspaceId) return;
    try {
      setProfiles(await getBusinessActorProfiles(preference.workspaceId));
      setCommandMessage('Directory refreshed.');
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The directory could not be refreshed.');
    }
  };

  const assignPendingStaff = async (pending: PendingStaffAssignment, selected: BusinessWorkspacePreference) => {
    const result = await runBusinessCommand<{ actorProfileId: string }>(
      selected.workspaceId,
      selected,
      { type: 'actor-profile.assign', payload: { persona: pending.persona, staffMemberId: pending.staffMemberId } },
      pending.idempotencyKey
    );
    setPendingAssignment(null);
    setCommandMessage(`${pending.displayName} was added to the ${pending.persona} directory.`);
    await refreshProfiles();
    return result;
  };

  const addStaffPersona = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preference?.actorId || !preference.persona || !context?.allowedActions.includes('directory.manage')) return;
    setCommandBusy(true);
    setCommandMessage('');
    try {
      if (pendingAssignment) {
        await assignPendingStaff(pendingAssignment, preference);
      } else {
        const createInput = pendingCreate.current ??= {
          idempotencyKey: newBusinessIdempotencyKey(),
          displayName: staffName,
          naturalPersonKey: staffNaturalKey,
          email: staffEmail,
          grade: staffGrade
        };
        const created = await runBusinessCommand<{ staffMemberId: string }>(
          preference.workspaceId,
          preference,
          { type: 'staff.create', payload: {
            displayName: createInput.displayName,
            naturalPersonKey: createInput.naturalPersonKey,
            email: createInput.email,
            grade: createInput.grade
          } },
          createInput.idempotencyKey
        );
        const pending: PendingStaffAssignment = {
          staffMemberId: created.result.staffMemberId,
          persona: staffPersona,
          idempotencyKey: newBusinessIdempotencyKey(),
          displayName: createInput.displayName
        };
        pendingCreate.current = null;
        setPendingAssignment(pending);
        await assignPendingStaff(pending, preference);
        setStaffName('');
        setStaffNaturalKey('');
        setStaffEmail('');
        setStaffGrade('ASSOCIATE');
        setStaffPersona('PREPARER');
      }
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The directory command failed. Retry without closing this panel.');
    } finally {
      setCommandBusy(false);
    }
  };

  const commandKeyFor = (slot: string, payload: unknown): string => {
    const signature = JSON.stringify(payload);
    const current = businessCommandKeys.current.get(slot);
    if (current?.signature === signature) return current.key;
    const next = { signature, key: newBusinessIdempotencyKey() };
    businessCommandKeys.current.set(slot, next);
    return next.key;
  };

  const currentSelection = (): BusinessWorkspacePreference | null =>
    preference?.actorId && preference.persona ? preference : null;

  const selectClientContext = (clientId: string) => {
    if (!preference?.workspaceId || !preference.actorId || !preference.persona || preference.persona === 'CLIENT') return;
    saveBusinessWorkspacePreference({
      version: 1, workspaceId: preference.workspaceId, actorId: preference.actorId, persona: preference.persona,
      ...(clientId ? { clientId } : {})
    });
  };

  const createClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('client.manage')) return;
    const payload = {
      code: clientCode, legalName: clientName, entityType: clientType,
      ...(clientType === 'SUBSIDIARY' && preference?.clientId ? { parentClientId: preference.clientId } : {}),
      industry: clientIndustry, address: clientAddress, countryCode: 'QA',
      primaryContact: {
        fullName: primaryContactName, email: primaryContactEmail, title: primaryContactRole.replaceAll('_', ' '),
        role: primaryContactRole, effectiveFrom: new Date().toISOString().slice(0, 10)
      }
    };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const created = await runBusinessCommand<{ clientId: string; primaryContactId: string }>(
        selected.workspaceId, selected, { type: 'client.create', payload }, commandKeyFor('client.create', payload)
      );
      businessCommandKeys.current.delete('client.create');
      setClientCode(''); setClientName(''); setClientIndustry(''); setClientAddress('');
      setPrimaryContactName(''); setPrimaryContactEmail('');
      selectClientContext(created.result.clientId);
      setCommandMessage(`${clientName} was saved with its primary contact and default role routes.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The client could not be saved. Retry with the same details.');
    } finally { setCommandBusy(false); }
  };

  const createLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('lead.manage')) return;
    let commandContext = selected;
    let payload: Record<string, unknown>;
    if (leadClientMode === 'EXISTING') {
      const clientId = preference?.clientId;
      const primaryContact = clientDetail?.contacts.find(contact => contact.active && contact.isPrimary);
      if (!clientId || !primaryContact) {
        setCommandMessage('Select an existing client with an active primary contact, or choose new prospect.');
        return;
      }
      payload = {
        clientId, primaryContactId: primaryContact.id, source: leadSource, receivedAt: new Date().toISOString(),
        requestedService: leadService, periodStart: leadPeriodStart, periodEnd: leadPeriodEnd,
        ...(leadEstimatedFee ? { estimatedFeeMinor: leadEstimatedFee } : {})
      };
    } else {
      commandContext = { ...selected, clientId: undefined, engagementId: undefined };
      payload = {
        newClient: {
          code: leadClientCode, legalName: leadClientName, industry: leadClientIndustry, address: leadClientAddress,
          countryCode: 'QA',
          primaryContact: {
            fullName: leadContactName,
            ...(leadContactEmail ? { email: leadContactEmail } : {}),
            ...(leadContactPhone ? { phone: leadContactPhone } : {}),
            title: leadContactTitle, role: leadContactRole
          }
        },
        source: leadSource, receivedAt: new Date().toISOString(), requestedService: leadService,
        periodStart: leadPeriodStart, periodEnd: leadPeriodEnd,
        ...(leadEstimatedFee ? { estimatedFeeMinor: leadEstimatedFee } : {})
      };
    }
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const created = await runBusinessCommand<{ leadId: string; clientId: string; createdClient: boolean }>(
        selected.workspaceId, commandContext, { type: 'lead.create', payload }, commandKeyFor('lead.create', payload)
      );
      businessCommandKeys.current.delete('lead.create');
      setLeadEstimatedFee('');
      if (created.result.createdClient) {
        setLeadClientCode(''); setLeadClientName(''); setLeadClientIndustry(''); setLeadClientAddress('');
        setLeadContactName(''); setLeadContactEmail(''); setLeadContactPhone('');
        selectClientContext(created.result.clientId);
        setLeadClientMode('EXISTING');
      }
      setCommandMessage(created.result.createdClient
        ? 'Lead intake, client, primary contact and default role routes were saved atomically.'
        : 'Lead intake was recorded against the selected client and primary contact.');
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The lead could not be saved. Retry with the same details.');
    } finally { setCommandBusy(false); }
  };

  const createStandardsProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('standards.manage')) return;
    const payload = {
      name: standardsName, effectivePeriodStart: standardsStart,
      ...(standardsEnd ? { effectivePeriodEnd: standardsEnd } : {}),
      isa220Edition, isa570Edition, reportingFramework, presentationEdition, earlyAdoption: false
    };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      await runBusinessCommand(selected.workspaceId, selected, { type: 'standards-profile.create', payload }, commandKeyFor('standards.create', payload));
      businessCommandKeys.current.delete('standards.create');
      setStandardsName(''); setIsa220Edition(''); setIsa570Edition(''); setReportingFramework('');
      setCommandMessage('The standards profile was saved as an immutable, Partner-approved version.');
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The standards profile could not be saved.');
    } finally { setCommandBusy(false); }
  };

  const saveFirmProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('firm.manage')) return;
    const payload = {
      expectedVersion: proposalWorkspace?.firmProfile?.version ?? null,
      legalName: firmLegalName, registrationNumber: firmRegistrationNumber, address: firmAddress,
      profileText: firmProfileText, methodologyText: firmMethodologyText
    };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const saved = await runBusinessCommand<{ firmProfileId: string; version: number }>(
        selected.workspaceId, selected, { type: 'firm-profile.save', payload }, commandKeyFor('firm-profile.save', payload)
      );
      businessCommandKeys.current.delete('firm-profile.save');
      setCommandMessage(`Firm profile revision ${saved.result.version} saved. New proposals will snapshot this approved content.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The firm profile could not be saved.');
    } finally { setCommandBusy(false); }
  };

  const attachTeamCv = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('firm.manage')) return;
    const payload = { staffMemberId: cvStaffMemberId, fileVersionId: cvFileVersionId };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const attached = await runBusinessCommand<{ teamCvId: string }>(
        selected.workspaceId, selected, { type: 'team-cv.attach', payload }, commandKeyFor('team-cv.attach', payload)
      );
      businessCommandKeys.current.delete('team-cv.attach');
      setCommandMessage('The committed CV is attached and awaiting Partner approval.');
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The CV could not be attached.');
    } finally { setCommandBusy(false); }
  };

  const approveTeamCv = async (cv: BusinessProposalWorkspace['teamCvs'][number]) => {
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('firm.manage')) return;
    const payload = { teamCvId: cv.id, expectedVersion: cv.version, rationale: 'Partner reviewed the committed staff CV and approves it for proposal use.' };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      await runBusinessCommand(selected.workspaceId, selected, { type: 'team-cv.approve', payload }, commandKeyFor(`team-cv.approve.${cv.id}`, payload));
      businessCommandKeys.current.delete(`team-cv.approve.${cv.id}`);
      setCommandMessage(`${cv.displayName}’s CV is approved for future proposal snapshots.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The CV approval could not be recorded.');
    } finally { setCommandBusy(false); }
  };

  const createProposal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = currentSelection();
    const engagement = proposalWorkspace?.engagements.find(item => item.id === proposalEngagementId);
    if (!selected || !engagement || !context?.allowedActions.includes('proposal.create')) return;
    const payload = {
      engagementId: engagement.id, expectedEngagementVersion: engagement.version, mode: proposalMode,
      scope: proposalScope, feeMinor: proposalFeeMinor, validUntil: proposalValidUntil,
      timeline: [{ name: proposalMilestoneName, date: proposalMilestoneDate }]
    };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const created = await runBusinessCommand<{ proposalId: string; proposalVersionId: string; revision: number; advanceMinor: string; finalMinor: string }>(
        selected.workspaceId, selected, { type: 'proposal.create', payload }, commandKeyFor('proposal.create', payload)
      );
      businessCommandKeys.current.delete('proposal.create');
      setCommandMessage(`Proposal revision ${created.result.revision} saved. QAR minor-unit terms split to ${created.result.advanceMinor} advance and ${created.result.finalMinor} final.`);
      setProposalScope(''); setProposalFeeMinor('');
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The proposal could not be saved.');
    } finally { setCommandBusy(false); }
  };

  const generateProposal = async (proposal: BusinessProposal) => {
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('proposal.generate')) return;
    const payload = { proposalVersionId: proposal.proposalVersionId, expectedVersion: 1 };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const queued = await runBusinessCommand<{ jobId: string; status: string }>(
        selected.workspaceId, selected, { type: 'proposal.generate', payload }, commandKeyFor(`proposal.generate.${proposal.proposalVersionId}`, payload)
      );
      setCommandMessage(`Document job ${queued.result.jobId} is ${queued.result.status.toLowerCase()}. It will not be treated as ready until its stored PDF is verified.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The proposal document could not be queued.');
    } finally { setCommandBusy(false); }
  };

  const retryProposalDocument = async (proposal: BusinessProposal) => {
    const selected = currentSelection();
    if (!selected || !proposal.documentJobId || !context?.allowedActions.includes('proposal.generate')) return;
    const payload = { proposalVersionId: proposal.proposalVersionId, expectedVersion: 1, failedJobId: proposal.documentJobId };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const retried = await runBusinessCommand<{ jobId: string; status: string }>(
        selected.workspaceId, selected, { type: 'proposal.generate.retry', payload }, newBusinessIdempotencyKey()
      );
      setCommandMessage(`Proposal PDF job ${retried.result.jobId} was returned to the queue. Its artifact remains unavailable until storage verification succeeds.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The proposal PDF could not be queued for a verified retry.');
    } finally { setCommandBusy(false); }
  };

  const approveProposal = async (proposal: BusinessProposal) => {
    const selected = currentSelection();
    if (!selected || !context?.allowedActions.includes('proposal.approve')) return;
    const note = approvalNotes[proposal.proposalVersionId] ?? 'Reviewed against the current firm profile and client terms.';
    const payload = { proposalVersionId: proposal.proposalVersionId, expectedVersion: 1, note };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      await runBusinessCommand(selected.workspaceId, selected, { type: 'proposal.approve', payload }, commandKeyFor(`proposal.approve.${proposal.proposalVersionId}`, payload));
      businessCommandKeys.current.delete(`proposal.approve.${proposal.proposalVersionId}`);
      setCommandMessage(`Partner approval recorded against proposal revision ${proposal.revision}.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The proposal approval could not be recorded.');
    } finally { setCommandBusy(false); }
  };

  const dispatchProposal = async (proposal: BusinessProposal) => {
    const selected = currentSelection();
    const contactRouteId = proposalRouteIds[proposal.proposalVersionId];
    if (!selected || !contactRouteId || !context?.allowedActions.includes('proposal.dispatch')) return;
    const payload = { proposalVersionId: proposal.proposalVersionId, expectedVersion: 1, contactRouteId };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const queued = await runBusinessCommand<{ dispatchId: string; jobId: string; status: string }>(
        selected.workspaceId, selected, { type: 'proposal.dispatch', payload }, commandKeyFor(`proposal.dispatch.${proposal.proposalVersionId}`, payload)
      );
      setCommandMessage(`Dispatch ${queued.result.status.toLowerCase()} for the saved recipient snapshot. Lifecycle advances only after provider acceptance.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The proposal dispatch could not be queued.');
    } finally { setCommandBusy(false); }
  };

  const retryProposalDispatch = async (proposal: BusinessProposal) => {
    const selected = currentSelection();
    if (!selected || !proposal.dispatchId || !proposal.dispatchVersion || !context?.allowedActions.includes('proposal.dispatch')) return;
    const payload = { dispatchId: proposal.dispatchId, expectedVersion: proposal.dispatchVersion };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const retried = await runBusinessCommand<{ dispatchId: string; jobId: string; status: string }>(
        selected.workspaceId, selected, { type: 'proposal.dispatch.retry', payload }, newBusinessIdempotencyKey()
      );
      setCommandMessage(`Dispatch ${retried.result.status.toLowerCase()} using the same approved proposal and recipient snapshot. Lifecycle advances only after provider acceptance.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The failed dispatch could not be retried.');
    } finally { setCommandBusy(false); }
  };

  const convertLead = async (lead: BusinessLead) => {
    const selected = currentSelection();
    const standardsProfile = standardsProfiles[0];
    const fee = contractFeeMinor || lead.estimatedFeeMinor;
    if (!selected || !standardsProfile || !context?.allowedActions.includes('lead.convert') || !engagementCode.trim() || !fee) return;
    const payload = { leadId: lead.id, expectedVersion: lead.version, engagementCode: engagementCode.trim(), standardsProfileId: standardsProfile.id, contractFeeMinor: fee };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const result = await runBusinessCommand<{ engagementId: string; state: string; version: number }>(
        selected.workspaceId, selected, { type: 'lead.convert', payload }, commandKeyFor(`lead.convert.${lead.id}`, payload)
      );
      businessCommandKeys.current.delete(`lead.convert.${lead.id}`);
      setCreatedEngagement({ id: result.result.engagementId, version: result.result.version, state: result.result.state });
      setEngagementCode(''); setContractFeeMinor('');
      setCommandMessage(`Lead converted to engagement ${result.result.engagementId}.`);
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The lead could not be converted. Retry with the same details.');
    } finally { setCommandBusy(false); }
  };

  const advanceCreatedEngagement = async () => {
    const selected = currentSelection();
    if (!selected || !createdEngagement || !context?.allowedActions.includes('engagement.advance')) return;
    const payload = { engagementId: createdEngagement.id, expectedVersion: createdEngagement.version, expectedState: 'LEAD_INGESTION' as const };
    setCommandBusy(true);
    setCommandMessage('');
    try {
      const result = await runBusinessCommand<{ state: string; version: number }>(
        selected.workspaceId, selected, { type: 'engagement.advance', payload }, commandKeyFor('engagement.advance', payload)
      );
      businessCommandKeys.current.delete('engagement.advance');
      setCreatedEngagement({ ...createdEngagement, version: result.result.version, state: result.result.state });
      setCommandMessage(`Engagement advanced to ${result.result.state}.`);
    } catch (reason) {
      setCommandMessage(reason instanceof Error ? reason.message : 'The engagement could not be advanced.');
    } finally { setCommandBusy(false); }
  };

  const storeFirmFile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selected = currentSelection();
    const upload = selectedUploadFile;
    if (!selected || !upload || context?.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') return;
    setFileBusy(true);
    setFileMessage('');
    setFileError('');
    try {
      if (upload.size < 1 || upload.size > 25 * 1024 * 1024) throw new Error('Choose a file between 1 byte and 25 MiB.');
      const mediaTypes: BusinessFileMediaType[] = [
        'application/pdf', 'text/plain', 'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png', 'image/jpeg', 'application/zip'
      ];
      if (!mediaTypes.includes(upload.type as BusinessFileMediaType)) throw new Error('The selected file must have a supported, declared file type.');
      const input = { purpose: filePurpose, originalName: upload.name, mediaType: upload.type as BusinessFileMediaType, sizeBytes: upload.size };
      const reservation = await initializeBusinessFile(
        selected.workspaceId, selected, input, commandKeyFor('file.reserve', input)
      );
      const stagedResponse = await uploadBusinessFile(
        selected.workspaceId, selected, reservation, upload, input.mediaType,
        commandKeyFor(`file.stage.${reservation.fileId}`, { fileId: reservation.fileId, version: reservation.version, name: upload.name, size: upload.size, mediaType: upload.type, lastModified: upload.lastModified })
      );
      const staged = stagedResponse;
      const committed = await completeBusinessFile(
        selected.workspaceId, selected, staged,
        commandKeyFor(`file.commit.${reservation.fileId}`, staged)
      );
      businessCommandKeys.current.delete('file.reserve');
      businessCommandKeys.current.delete(`file.stage.${reservation.fileId}`);
      businessCommandKeys.current.delete(`file.commit.${reservation.fileId}`);
      setFileMessage(`${upload.name} is committed and verified (${committed.sha256.slice(0, 12)}…).`);
      setSelectedUploadFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setRecordsKey(value => value + 1);
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : 'The file could not be stored. Retry with the same file.');
    } finally { setFileBusy(false); }
  };

  const downloadStoredFile = async (file: BusinessFileMetadata) => {
    const selected = currentSelection();
    if (!selected) return;
    setDownloadingFileId(file.id);
    setFileError('');
    try {
      const blob = await downloadBusinessFile(selected.workspaceId, file, selected);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : 'The stored file could not be downloaded.');
    } finally { setDownloadingFileId(null); }
  };

  const riskEngagement = proposalWorkspace?.engagements.find(item => item.id === riskEngagementId) ?? null;

  return <main className="business-console">
    <header className="business-console-header">
      <div className="business-console-brand">
        <span className="business-brand-mark" aria-hidden="true">AS</span>
        <div><strong>AuditSphere</strong><span>Business workspace</span></div>
      </div>
      <button type="button" className="btn sm" onClick={clearBusinessWorkspacePreference}>Switch to prototype / TEST</button>
    </header>

    <div className="business-console-content">
      <section className="business-overview-card" aria-labelledby="business-workspace-heading">
        <div className="business-overview-copy">
          <p className="business-eyebrow">SERVER-PERSISTED · QAR · ASIA/QATAR</p>
          <h1 id="business-workspace-heading">{workspace?.name ?? 'Business workspace'}</h1>
          <p>Records in this workspace are read from the Worker database. A connection problem stays visible here; no prototype or browser-local business data will be loaded.</p>
        </div>
        <div className="business-workspace-status">
          <span className={loading ? 'business-status-dot loading' : error ? 'business-status-dot error' : 'business-status-dot'} aria-hidden="true" />
          <span role="status">{loading ? 'Connecting' : error ? 'Unavailable / needs attention' : workspace?.status ?? 'Ready'}</span>
        </div>
      </section>

      {error && <div className="business-alert business-console-alert" role="alert">
        <span>{error}</span>
        <button type="button" className="btn sm" disabled={loading} onClick={() => setRetryKey(value => value + 1)}>Retry</button>
      </div>}
      {recordError && <div className="business-alert business-console-alert" role="alert"><span>{recordError}</span><button type="button" className="btn sm" onClick={() => setRecordsKey(value => value + 1)}>Retry records</button></div>}
      {commandMessage && <p className="business-command-message" role="status">{commandMessage}</p>}

      {!loading && workspace && <>
        <section className="business-context-card" aria-labelledby="business-context-heading">
          <div>
            <p className="business-eyebrow">CURRENT REQUEST CONTEXT</p>
            <h2 id="business-context-heading">Self-selected persona</h2>
          </div>
          <label className="business-field business-persona-select" htmlFor="business-active-persona">
            <span>Active persona</span>
            <select id="business-active-persona" value={selectedProfile?.id ?? ''} disabled={!profiles.length || loading} onChange={event => {
              const chosen = profiles.find(profile => profile.id === event.target.value);
              if (chosen) selectBusinessActor(chosen);
            }}>
              <option value="">Choose a configured profile</option>
              {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.persona} · {profile.displayName}{profile.staffGrade ? ` · ${profile.staffGrade}` : ''}</option>)}
            </select>
          </label>
          {context?.allowedActions.includes('client.read') && selectedProfile?.persona !== 'CLIENT' && <label className="business-field business-client-context" htmlFor="business-selected-client">
            <span>Selected client context</span>
            <select id="business-selected-client" value={preference?.clientId ?? ''} onChange={event => selectClientContext(event.target.value)}>
              <option value="">All clients · workspace view</option>
              {clients.map(client => <option key={client.id} value={client.id}>{client.code ?? client.id.slice(0, 8)} · {client.legalName}</option>)}
            </select>
          </label>}
          {selectedProfile ? <div className="business-actor-summary">
            <strong>{selectedProfile.displayName}</strong>
            <span>{selectedProfile.persona}{selectedProfile.staffGrade ? ` · ${selectedProfile.staffGrade}` : ''}</span>
            {selectedProfile.persona === 'CLIENT' && <span>Client projection only</span>}
          </div> : <p className="business-muted">No active profile is selected. Choose a configured profile or add one from the directory setup below.</p>}
          <p className="business-self-select-note">Persona selection changes the request context in this browser only. It is not authentication or identity verification.</p>
          {context?.readOnlyReasons.map(reason => <p className="business-muted" key={reason}>{reason.replaceAll('_', ' ').toLowerCase()}</p>)}
        </section>

        {context?.allowedActions.includes('directory.manage') && <section className="business-directory-card" aria-labelledby="business-directory-heading">
          <div className="business-section-heading">
            <div><p className="business-eyebrow">WORKSPACE DIRECTORY</p><h2 id="business-directory-heading">Configure staff personas</h2></div>
            <button type="button" className="btn sm" onClick={() => void refreshProfiles()}>Refresh profiles</button>
          </div>
          {profiles.length ? <ul className="business-profile-list" aria-label="Configured actor profiles">
            {profiles.map(profile => <li key={profile.id}><span className="business-profile-persona">{profile.persona}</span><span>{profile.displayName}</span><small>{profile.staffGrade ?? `Client ${profile.clientId ?? ''}`}</small></li>)}
          </ul> : <p className="business-muted">There are no configured actor profiles yet.</p>}
          <form className="business-form business-staff-form" onSubmit={addStaffPersona}>
            <div className="business-form-grid">
              <label className="business-field" htmlFor="business-staff-name"><span>Staff display name</span><input id="business-staff-name" required maxLength={200} value={staffName} onChange={event => { pendingCreate.current = null; setStaffName(event.target.value); }} /></label>
              <label className="business-field" htmlFor="business-staff-person-key"><span>Natural-person key</span><input id="business-staff-person-key" required maxLength={200} value={staffNaturalKey} onChange={event => { pendingCreate.current = null; setStaffNaturalKey(event.target.value); }} /></label>
              <label className="business-field" htmlFor="business-staff-email"><span>Email</span><input id="business-staff-email" type="email" maxLength={254} value={staffEmail} onChange={event => { pendingCreate.current = null; setStaffEmail(event.target.value); }} /></label>
              <label className="business-field" htmlFor="business-staff-grade"><span>Staff grade</span><select id="business-staff-grade" value={staffGrade} onChange={event => {
                const grade = event.target.value as StaffGrade;
                setStaffGrade(grade);
                setStaffPersona(current => gradeAllowsPersona(grade, current) ? current : 'PREPARER');
                pendingCreate.current = null;
              }}><option value="PARTNER">PARTNER</option><option value="MANAGER">MANAGER</option><option value="SENIOR">SENIOR</option><option value="ASSOCIATE">ASSOCIATE</option></select></label>
              <label className="business-field" htmlFor="business-staff-persona"><span>Persona profile</span><select id="business-staff-persona" value={staffPersona} onChange={event => setStaffPersona(event.target.value as Exclude<BusinessPersona, 'CLIENT'>)}>
                <option value="PREPARER">PREPARER</option>
                <option value="REVIEWER" disabled={!gradeAllowsPersona(staffGrade, 'REVIEWER')}>REVIEWER · manager or senior</option>
                <option value="APPROVER" disabled={!gradeAllowsPersona(staffGrade, 'APPROVER')}>APPROVER · partner</option>
              </select></label>
            </div>
            <p className="business-note">Staff and profile changes use separate idempotent commands. The profile is assigned only when its grade rules pass.</p>
            {pendingAssignment && <div className="business-pending-assignment" role="status">Staff record saved for {pendingAssignment.displayName}; profile assignment is pending.</div>}
            {commandMessage && <p className="business-command-message" role="status">{commandMessage}</p>}
            <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={commandBusy || !selectedProfile || !gradeAllowsPersona(staffGrade, staffPersona)}>{commandBusy ? 'Saving…' : pendingAssignment ? `Retry ${pendingAssignment.persona} assignment` : `Add ${staffPersona.toLowerCase()} profile`}</button></div>
          </form>
          {!profiles.some(profile => profile.persona === 'CLIENT') && <p className="business-muted">CLIENT profiles become available after a client and contact are created in the commercial workflow.</p>}
        </section>}

        {context?.allowedActions.includes('client.read') && <section className="business-directory-card" aria-labelledby="business-clients-heading">
          <div className="business-section-heading"><div><p className="business-eyebrow">COMMERCIAL · US-ENG-001</p><h2 id="business-clients-heading">Client registry</h2></div><span className="business-count">{clients.length} loaded</span></div>
          {clients.length ? <ul className="business-client-list" aria-label="Workspace clients">{clients.map(client => <li key={client.id}>
            <button type="button" className={preference?.clientId === client.id ? 'business-client-choice selected' : 'business-client-choice'} onClick={() => selectClientContext(client.id)}>
              <strong>{client.legalName}</strong><span>{client.code ?? client.id.slice(0, 8)} · {client.entityType ?? 'CLIENT'}</span>
            </button>
          </li>)}</ul> : <p className="business-muted">No clients are registered. Add the first real client and primary contact below.</p>}

          {context.allowedActions.includes('client.manage') && <form className="business-form business-commercial-form" onSubmit={createClient}>
            <h3>Create client and primary contact</h3>
            <div className="business-form-grid">
              <label className="business-field" htmlFor="business-client-code"><span>Client code</span><input id="business-client-code" required maxLength={200} value={clientCode} onChange={event => setClientCode(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-client-name"><span>Legal name</span><input id="business-client-name" required maxLength={250} value={clientName} onChange={event => setClientName(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-client-type"><span>Organization type</span><select id="business-client-type" value={clientType} onChange={event => setClientType(event.target.value as typeof clientType)}><option value="STANDALONE">Standalone</option><option value="HOLDING">Holding</option><option value="SUBSIDIARY">Subsidiary of selected client</option></select></label>
              <label className="business-field" htmlFor="business-client-industry"><span>Industry</span><input id="business-client-industry" required maxLength={200} value={clientIndustry} onChange={event => setClientIndustry(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-client-address"><span>Registered address</span><input id="business-client-address" required maxLength={1000} value={clientAddress} onChange={event => setClientAddress(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-client-country"><span>Country</span><input id="business-client-country" value="QA · Qatar" readOnly /></label>
              <label className="business-field" htmlFor="business-primary-contact-name"><span>Primary contact</span><input id="business-primary-contact-name" required maxLength={200} value={primaryContactName} onChange={event => setPrimaryContactName(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-primary-contact-email"><span>Contact email</span><input id="business-primary-contact-email" type="email" required maxLength={254} value={primaryContactEmail} onChange={event => setPrimaryContactEmail(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-primary-contact-role"><span>Contact role</span><select id="business-primary-contact-role" value={primaryContactRole} onChange={event => setPrimaryContactRole(event.target.value as typeof primaryContactRole)}><option value="MD_GM">MD / General Manager</option><option value="CFO_FINANCE_DIRECTOR">CFO / Finance Director</option><option value="CHIEF_ACCOUNTANT_LIAISON">Chief Accountant / Audit Liaison</option><option value="OTHER">Other</option></select></label>
            </div>
            {clientType === 'SUBSIDIARY' && !preference?.clientId && <p className="business-alert" role="alert">Choose a parent client context before creating a subsidiary.</p>}
            <p className="business-note">Country and currency follow this QAR / Qatar workspace. Contact routes are created from the selected role and can be changed with an explicit route command.</p>
            <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={commandBusy || (clientType === 'SUBSIDIARY' && !preference?.clientId)}>{commandBusy ? 'Saving…' : 'Create client'}</button></div>
          </form>}

          {preference?.clientId && clientDetail && <div className="business-client-detail">
            <div className="business-section-heading"><div><p className="business-eyebrow">SELECTED CLIENT</p><h3>{clientDetail.client.legalName}</h3></div><span>v{clientDetail.client.version}</span></div>
            <p>{clientDetail.client.entityType ?? 'Client'} · {clientDetail.client.industry} · {clientDetail.client.countryCode}</p>
            <h4>Active contacts</h4>
            {clientDetail.contacts.length ? <ul className="business-record-list">{clientDetail.contacts.map(contact => <li key={contact.id}><strong>{contact.full_name}</strong><span>{contact.role.replaceAll('_', ' ')}{contact.isPrimary ? ' · Primary' : ''}</span><small>{contact.email ?? contact.phone}</small></li>)}</ul> : <p className="business-muted">No active contact is available in this projection.</p>}
            <h4>Communication routes</h4>
            {clientDetail.routes.length ? <ul className="business-route-list">{clientDetail.routes.map((route, index) => <li key={`${route.id}-${index}`}><span>{route.purpose.replaceAll('_', ' ')}</span><strong>{route.full_name}</strong><small>{route.email ?? route.phone}</small></li>)}</ul> : <p className="business-muted">No configured routes.</p>}
          </div>}
        </section>}

        {context?.allowedActions.includes('lead.read') && <section className="business-directory-card" aria-labelledby="business-leads-heading">
          <div className="business-section-heading"><div><p className="business-eyebrow">COMMERCIAL · US-ENG-002</p><h2 id="business-leads-heading">Lead pipeline</h2></div><span className="business-count">{leads.length} loaded</span></div>
          {context.allowedActions.includes('lead.manage') && <form className="business-form business-commercial-form" onSubmit={createLead}>
            <h3>Record an inquiry</h3>
            <div className="business-form-grid">
              <label className="business-field" htmlFor="business-lead-client-mode"><span>Prospect link</span><select id="business-lead-client-mode" value={leadClientMode} onChange={event => setLeadClientMode(event.target.value as typeof leadClientMode)}><option value="NEW">Create prospect, contact and lead</option><option value="EXISTING">Link an existing client</option></select></label>
              {leadClientMode === 'EXISTING' ? <label className="business-field" htmlFor="business-lead-client"><span>Existing client</span><select id="business-lead-client" value={preference?.clientId ?? ''} onChange={event => selectClientContext(event.target.value)} required><option value="">Select a client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.legalName} · {client.code ?? client.id.slice(0, 8)}</option>)}</select></label> : <>
                <label className="business-field" htmlFor="business-lead-client-code"><span>Client code</span><input id="business-lead-client-code" required maxLength={200} value={leadClientCode} onChange={event => setLeadClientCode(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-lead-client-name"><span>Prospect legal name</span><input id="business-lead-client-name" required maxLength={250} value={leadClientName} onChange={event => setLeadClientName(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-lead-industry"><span>Industry</span><input id="business-lead-industry" required maxLength={200} value={leadClientIndustry} onChange={event => setLeadClientIndustry(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-lead-address"><span>Registered address</span><input id="business-lead-address" required maxLength={1000} value={leadClientAddress} onChange={event => setLeadClientAddress(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-lead-contact-name"><span>Primary contact</span><input id="business-lead-contact-name" required maxLength={200} value={leadContactName} onChange={event => setLeadContactName(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-lead-contact-email"><span>Contact email</span><input id="business-lead-contact-email" type="email" maxLength={254} value={leadContactEmail} onChange={event => setLeadContactEmail(event.target.value)} required={!leadContactPhone} /></label>
                <label className="business-field" htmlFor="business-lead-contact-phone"><span>Contact phone</span><input id="business-lead-contact-phone" type="tel" maxLength={40} value={leadContactPhone} onChange={event => setLeadContactPhone(event.target.value)} required={!leadContactEmail} /></label>
                <label className="business-field" htmlFor="business-lead-contact-title"><span>Contact title</span><input id="business-lead-contact-title" required maxLength={200} value={leadContactTitle} onChange={event => setLeadContactTitle(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-lead-contact-role"><span>Contact role</span><select id="business-lead-contact-role" value={leadContactRole} onChange={event => setLeadContactRole(event.target.value as typeof leadContactRole)}><option value="MD_GM">MD / General Manager</option><option value="CFO_FINANCE_DIRECTOR">CFO / Finance Director</option><option value="CHIEF_ACCOUNTANT_LIAISON">Chief Accountant / Audit Liaison</option><option value="OTHER">Other</option></select></label>
              </>}
              <label className="business-field" htmlFor="business-lead-source"><span>Inquiry source</span><select id="business-lead-source" value={leadSource} onChange={event => setLeadSource(event.target.value as typeof leadSource)}><option value="PHONE">Phone</option><option value="WHATSAPP">WhatsApp inquiry</option><option value="EMAIL">Email</option><option value="WEB_FORM">Web form</option><option value="REFERRAL">Referral</option></select></label>
              <label className="business-field" htmlFor="business-lead-service"><span>Requested service</span><select id="business-lead-service" value={leadService} onChange={event => setLeadService(event.target.value as typeof leadService)}><option value="STATUTORY_AUDIT">Statutory audit</option><option value="INTERNAL_AUDIT">Internal audit</option><option value="AGREED_UPON_PROCEDURES">Agreed-upon procedures</option></select></label>
              <label className="business-field" htmlFor="business-lead-period-start"><span>Period start</span><input id="business-lead-period-start" type="date" required value={leadPeriodStart} onChange={event => setLeadPeriodStart(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-lead-period-end"><span>Period end</span><input id="business-lead-period-end" type="date" required value={leadPeriodEnd} onChange={event => setLeadPeriodEnd(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-lead-fee"><span>Estimated fee · QAR minor units</span><input id="business-lead-fee" inputMode="numeric" pattern="[0-9]*" value={leadEstimatedFee} onChange={event => setLeadEstimatedFee(event.target.value)} /><small>Optional intake estimate; no currency conversion or payment is implied.</small></label>
            </div>
            {leadClientMode === 'NEW' && <p className="business-note">Client, primary contact, default role routes and lead are created in one transaction. Exact legal-name and code matches require you to link the existing client; no fuzzy auto-merge is performed.</p>}
            {leadClientMode === 'EXISTING' && preference?.clientId && !clientDetail?.contacts.some(contact => contact.active && contact.isPrimary) && <p className="business-alert" role="alert">This client needs an active primary contact before lead intake.</p>}
            <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={commandBusy || (leadClientMode === 'EXISTING' && (!preference?.clientId || !clientDetail?.contacts.some(contact => contact.active && contact.isPrimary)))}>{commandBusy ? 'Saving…' : 'Record lead'}</button></div>
          </form>}
          {leads.length ? <ul className="business-record-list business-lead-list">{leads.map(lead => <li key={lead.id}>
            <strong>{lead.clientName ?? 'Client'} · {lead.requestedService.replaceAll('_', ' ')}</strong>
            <span>{lead.source.replaceAll('_', ' ')} · {lead.periodStart} to {lead.periodEnd} · {lead.status}</span>
            <small>{lead.contactName ?? 'No active contact'} · {lead.estimatedFeeMinor ? `QAR minor ${lead.estimatedFeeMinor}` : 'Fee not set'}</small>
            {context.allowedActions.includes('lead.convert') && ['OPEN', 'QUALIFIED'].includes(lead.status) && <div className="business-convert-controls">
              <label className="business-field" htmlFor={`business-engagement-code-${lead.id}`}><span>Engagement code</span><input id={`business-engagement-code-${lead.id}`} required maxLength={200} value={engagementCode} onChange={event => setEngagementCode(event.target.value)} /></label>
              {!lead.estimatedFeeMinor && <label className="business-field" htmlFor="business-contract-fee"><span>Contract fee · QAR minor units</span><input id="business-contract-fee" inputMode="numeric" pattern="[0-9]*" value={contractFeeMinor} onChange={event => setContractFeeMinor(event.target.value)} /></label>}
              <button type="button" className="btn sm" disabled={commandBusy || !standardsProfiles.length || !engagementCode.trim() || !(contractFeeMinor || lead.estimatedFeeMinor)} onClick={() => void convertLead(lead)}>{commandBusy ? 'Converting…' : 'Convert to engagement'}</button>
            </div>}
          </li>)}</ul> : <p className="business-muted">No lead records match this context.</p>}
          {!standardsProfiles.length && context.allowedActions.includes('lead.convert') && <p className="business-note">Lead conversion is blocked until a Partner records the firm-approved standards profile covering the engagement period.</p>}
          {createdEngagement && <div className="business-created-engagement" role="status"><strong>Engagement {createdEngagement.id}</strong><span>Current state: {createdEngagement.state}</span>{createdEngagement.state === 'LEAD_INGESTION' && context.allowedActions.includes('engagement.advance') && <button type="button" className="btn sm" disabled={commandBusy} onClick={() => void advanceCreatedEngagement()}>Validate profile and enter proposal generation</button>}</div>}
        </section>}

        {context?.allowedActions.includes('standards.read') && <section className="business-directory-card" aria-labelledby="business-standards-heading">
          <div className="business-section-heading"><div><p className="business-eyebrow">FIRM APPROVED REFERENCE</p><h2 id="business-standards-heading">Standards profiles</h2></div><span className="business-count">{standardsProfiles.length} versions</span></div>
          {standardsProfiles.length ? <ul className="business-record-list">{standardsProfiles.map(profile => <li key={profile.id}><strong>{profile.name}</strong><span>{profile.effectivePeriodStart}–{profile.effectivePeriodEnd ?? 'open'} · {profile.reportingFramework} · {profile.presentationEdition}</span><small>{profile.isa220Edition} · {profile.isa570Edition} · SHA-256 {profile.contentSha256.slice(0, 12)}…</small></li>)}</ul> : <p className="business-muted">No standards profile has been approved. The firm must supply its applicable editions and reporting framework before conversion.</p>}
          {context.allowedActions.includes('standards.manage') && <form className="business-form business-commercial-form" onSubmit={createStandardsProfile}>
            <h3>Approve a standards profile version</h3>
            <div className="business-form-grid">
              <label className="business-field" htmlFor="business-standards-name"><span>Profile name</span><input id="business-standards-name" required maxLength={200} value={standardsName} onChange={event => setStandardsName(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-standards-start"><span>Period start</span><input id="business-standards-start" type="date" required value={standardsStart} onChange={event => setStandardsStart(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-standards-end"><span>Period end · optional</span><input id="business-standards-end" type="date" value={standardsEnd} onChange={event => setStandardsEnd(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-isa220"><span>ISA 220 edition</span><input id="business-isa220" required maxLength={200} value={isa220Edition} onChange={event => setIsa220Edition(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-isa570"><span>ISA 570 edition</span><input id="business-isa570" required maxLength={200} value={isa570Edition} onChange={event => setIsa570Edition(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-reporting-framework"><span>Reporting framework</span><input id="business-reporting-framework" required maxLength={200} value={reportingFramework} onChange={event => setReportingFramework(event.target.value)} /></label>
              <label className="business-field" htmlFor="business-presentation-edition"><span>Presentation edition</span><select id="business-presentation-edition" value={presentationEdition} onChange={event => setPresentationEdition(event.target.value as typeof presentationEdition)}><option value="IAS1">IAS 1</option><option value="IFRS18">IFRS 18</option><option value="OTHER_APPROVED">Other approved</option></select></label>
            </div>
            <p className="business-note">Only a Partner profile can approve this immutable basis. Enter firm-approved content; this form does not choose professional standards for the firm.</p>
            <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={commandBusy}>{commandBusy ? 'Saving…' : 'Approve standards profile'}</button></div>
          </form>}
        </section>}

        {context?.allowedActions.includes('proposal.read') && <section className="business-directory-card" aria-labelledby="business-proposals-heading">
          <div className="business-section-heading">
            <div><p className="business-eyebrow">COMMERCIAL · US-ENG-003</p><h2 id="business-proposals-heading">Quotes and proposals</h2></div>
            <span className="business-count">{proposalWorkspace?.proposals.length ?? 0} current revisions</span>
          </div>

          {context.actor.persona === 'CLIENT' ? <>
            <p className="business-note">Current Partner-approved revisions with committed PDFs appear here. Provider delivery status remains visible when available.</p>
            {proposalWorkspace?.proposals.length ? <ul className="business-record-list">
              {proposalWorkspace.proposals.map(proposal => {
                const artifact = files.find(file => file.id === proposal.artifactFileId);
                return <li key={proposal.proposalVersionId}>
                  <strong>{proposal.mode === 'QUOTE' ? 'Quotation' : 'Comprehensive proposal'} · Revision {proposal.revision}</strong>
                  <span>{proposal.clientName} · QAR {proposal.feeMinor} minor units · valid through {proposal.validUntil}</span>
                  <small>{proposal.scope} · provider status {proposal.dispatchStatus}</small>
                  {artifact && <button type="button" className="btn sm" disabled={downloadingFileId === artifact.id} onClick={() => void downloadStoredFile(artifact)}>{downloadingFileId === artifact.id ? 'Downloading…' : 'Download approved proposal'}</button>}
                  {preference && context && <BusinessAcceptanceRiskPanel workspaceId={preference.workspaceId} selected={preference} context={context}
                    engagementId={proposal.engagementId} clientId={proposal.clientId} engagementName={proposal.clientName} files={files}
                    clientProposal={proposal} onChanged={() => setRecordsKey(value => value + 1)} />}
                  {preference && context && <BusinessDeliveryPanel workspaceId={preference.workspaceId} selected={preference} context={context}
                    engagement={{ id: proposal.engagementId, clientId: proposal.clientId, clientName: proposal.clientName, lifecycleState: proposal.lifecycleState }}
                    files={files} onChanged={() => setRecordsKey(value => value + 1)} />}
                </li>;
              })}
            </ul> : <p className="business-muted">No accepted proposal is available for this client context.</p>}
          </> : <>
            {context.allowedActions.includes('firm.manage') && <>
              <form className="business-form business-commercial-form" onSubmit={saveFirmProfile}>
                <h3>{proposalWorkspace?.firmProfile ? `Partner-approved firm content · v${proposalWorkspace.firmProfile.version}` : 'Set up approved firm content'}</h3>
                <div className="business-form-grid">
                  <label className="business-field" htmlFor="business-firm-legal-name"><span>Legal firm name</span><input id="business-firm-legal-name" required maxLength={250} value={firmLegalName} onChange={event => setFirmLegalName(event.target.value)} /></label>
                  <label className="business-field" htmlFor="business-firm-registration"><span>Registration number</span><input id="business-firm-registration" required maxLength={200} value={firmRegistrationNumber} onChange={event => setFirmRegistrationNumber(event.target.value)} /></label>
                  <label className="business-field" htmlFor="business-firm-address"><span>Registered address</span><input id="business-firm-address" required maxLength={1000} value={firmAddress} onChange={event => setFirmAddress(event.target.value)} /></label>
                </div>
                <label className="business-field" htmlFor="business-firm-profile-text"><span>Approved firm profile</span><textarea id="business-firm-profile-text" className="input" required minLength={10} maxLength={10000} rows={3} value={firmProfileText} onChange={event => setFirmProfileText(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-firm-methodology"><span>Approved methodology summary</span><textarea id="business-firm-methodology" className="input" required minLength={10} maxLength={20000} rows={4} value={firmMethodologyText} onChange={event => setFirmMethodologyText(event.target.value)} /></label>
                <p className="business-note">Enter the firm’s actual registration and approved content. These values are snapshotted into new proposal revisions; no biography or professional claim is generated from a placeholder.</p>
                <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={commandBusy}>{commandBusy ? 'Saving…' : proposalWorkspace?.firmProfile ? 'Save new firm profile revision' : 'Save firm profile'}</button></div>
              </form>

              <form className="business-form business-commercial-form" onSubmit={attachTeamCv}>
                <h3>Attach an actual team CV</h3>
                <div className="business-form-grid">
                  <label className="business-field" htmlFor="business-cv-staff"><span>Staff member</span><select id="business-cv-staff" required value={cvStaffMemberId} onChange={event => setCvStaffMemberId(event.target.value)}><option value="">Select staff</option>{proposalWorkspace?.staffMembers.map(staff => <option key={staff.id} value={staff.id}>{staff.displayName} · {staff.grade}</option>)}</select></label>
                  <label className="business-field" htmlFor="business-cv-file"><span>Committed CV file</span><select id="business-cv-file" required value={cvFileVersionId} onChange={event => setCvFileVersionId(event.target.value)}><option value="">Select a stored PDF or DOCX</option>{files.filter(file => file.purpose === 'TEMPLATE' && ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mediaType)).map(file => <option key={file.id} value={file.id}>{file.originalName} · SHA-256 {file.sha256?.slice(0, 10)}</option>)}</select></label>
                </div>
                <p className="business-note">First store the original PDF or DOCX in Stored files as a firm template. The CV bytes stay unchanged; approval records the exact file version.</p>
                <div className="business-dialog-actions"><button className="btn" type="submit" disabled={commandBusy || !cvStaffMemberId || !cvFileVersionId}>{commandBusy ? 'Attaching…' : 'Attach CV for Partner review'}</button></div>
              </form>
              {proposalWorkspace?.teamCvs.length ? <ul className="business-record-list business-cv-list" aria-label="Attached team CVs">{proposalWorkspace.teamCvs.map(cv => <li key={cv.id}>
                <strong>{cv.displayName} · {cv.grade}</strong><span>{cv.originalName} · SHA-256 {cv.sha256.slice(0, 12)}…</span><small>{cv.approved ? `Approved ${cv.approvedAt ?? ''}` : 'Awaiting Partner approval'}</small>
                {!cv.approved && <button type="button" className="btn sm" disabled={commandBusy} onClick={() => void approveTeamCv(cv)}>Approve this CV</button>}
              </li>)}</ul> : <p className="business-muted">No actual team CV is attached yet. Full proposals remain blocked until the active Partner has an approved CV.</p>}
            </>}

            {context.allowedActions.includes('proposal.create') && <form className="business-form business-commercial-form" onSubmit={createProposal}>
              <h3>Draft a versioned proposal</h3>
              {!proposalWorkspace?.firmProfile && <p className="business-alert" role="alert">A Partner must save the firm’s legal registration, profile and methodology before a proposal can be created.</p>}
              <div className="business-form-grid">
                <label className="business-field" htmlFor="business-proposal-engagement"><span>Engagement in proposal generation</span><select id="business-proposal-engagement" required value={proposalEngagementId} onChange={event => setProposalEngagementId(event.target.value)}><option value="">Select engagement</option>{proposalWorkspace?.engagements.filter(engagement => engagement.lifecycleState === 'PROPOSAL_GENERATION').map(engagement => <option key={engagement.id} value={engagement.id}>{engagement.clientName} · {engagement.code} · {engagement.periodStart}–{engagement.periodEnd}</option>)}</select></label>
                <label className="business-field" htmlFor="business-proposal-mode"><span>Document mode</span><select id="business-proposal-mode" value={proposalMode} onChange={event => setProposalMode(event.target.value as typeof proposalMode)}><option value="QUOTE">Quotation · 1–2 pages</option><option value="FULL_PROPOSAL">Comprehensive proposal · approved team CV required</option></select></label>
                <label className="business-field" htmlFor="business-proposal-fee"><span>Total fee · QAR minor units</span><input id="business-proposal-fee" required inputMode="numeric" pattern="[0-9]*" value={proposalFeeMinor} onChange={event => setProposalFeeMinor(event.target.value)} /><small>Advance is rounded half-up; the final amount is the exact remainder.</small></label>
                <label className="business-field" htmlFor="business-proposal-valid-until"><span>Offer valid until</span><input id="business-proposal-valid-until" type="date" required value={proposalValidUntil} onChange={event => setProposalValidUntil(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-proposal-milestone"><span>Timeline milestone</span><input id="business-proposal-milestone" required maxLength={160} value={proposalMilestoneName} onChange={event => setProposalMilestoneName(event.target.value)} /></label>
                <label className="business-field" htmlFor="business-proposal-milestone-date"><span>Milestone date</span><input id="business-proposal-milestone-date" type="date" required value={proposalMilestoneDate} onChange={event => setProposalMilestoneDate(event.target.value)} /></label>
              </div>
              <label className="business-field" htmlFor="business-proposal-scope"><span>Agreed scope</span><textarea id="business-proposal-scope" className="input" required minLength={10} maxLength={10000} rows={3} value={proposalScope} onChange={event => setProposalScope(event.target.value)} /></label>
              <p className="business-note">Each revision pins the current firm profile, methodology hash and approved CV file IDs. A new revision does not overwrite a prior approval or document.</p>
              <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={commandBusy || !proposalWorkspace?.firmProfile || !proposalEngagementId}>{commandBusy ? 'Saving…' : 'Create proposal revision'}</button></div>
            </form>}

            {proposalWorkspace?.proposals.length ? <ul className="business-record-list business-proposal-list" aria-label="Current proposal revisions">{proposalWorkspace.proposals.map(proposal => {
              const routeOptions = proposalWorkspace.contactRoutes.filter(route => route.clientId === proposal.clientId);
              const routeValue = proposalRouteIds[proposal.proposalVersionId] ?? routeOptions[0]?.id ?? '';
              const artifact = files.find(file => file.id === proposal.artifactFileId);
              return <li key={proposal.proposalVersionId}>
                <strong>{proposal.clientName} · {proposal.mode === 'QUOTE' ? 'Quotation' : 'Full proposal'} · Revision {proposal.revision}</strong>
                <span>{proposal.lifecycleState} · QAR {proposal.feeMinor} minor · {proposal.advanceBps / 100}% / {proposal.finalBps / 100}% · valid until {proposal.validUntil}</span>
                <small>Document {proposal.documentStatus.replaceAll('_', ' ')} · Partner approval {proposal.approvalStatus} · dispatch {proposal.dispatchStatus.replaceAll('_', ' ')}{proposal.artifactSha256 ? ` · SHA-256 ${proposal.artifactSha256.slice(0, 12)}…` : ''}</small>
                {proposal.documentErrorCode && <small role="status">Document job: {proposal.documentErrorCode.replaceAll('_', ' ').toLowerCase()}.</small>}
                {proposal.dispatchErrorCode && <small role="status">Dispatch job: {proposal.dispatchErrorCode.replaceAll('_', ' ').toLowerCase()}.</small>}
                {proposal.documentStatus === 'NOT_GENERATED' && <button type="button" className="btn sm" disabled={commandBusy} onClick={() => void generateProposal(proposal)}>Generate verified PDF</button>}
                {['PENDING', 'RUNNING'].includes(proposal.documentStatus) && <button type="button" className="btn sm" disabled>Generating PDF…</button>}
                {['RETRYABLE_FAILED', 'PERMANENT_FAILED'].includes(proposal.documentStatus) && <button type="button" className="btn sm" disabled={commandBusy || !proposal.documentJobId} onClick={() => void retryProposalDocument(proposal)}>Retry PDF generation</button>}
                {artifact && <button type="button" className="btn sm" disabled={downloadingFileId === artifact.id} onClick={() => void downloadStoredFile(artifact)}>{downloadingFileId === artifact.id ? 'Downloading…' : 'Download generated PDF'}</button>}
                {context.allowedActions.includes('proposal.approve') && proposal.documentStatus === 'SUCCEEDED' && proposal.approvalStatus === 'PENDING' && <>
                  <label className="business-field" htmlFor={`business-proposal-approval-${proposal.proposalVersionId}`}><span>Partner approval note</span><input id={`business-proposal-approval-${proposal.proposalVersionId}`} minLength={10} maxLength={10000} value={approvalNotes[proposal.proposalVersionId] ?? 'Reviewed against the current firm profile and client terms.'} onChange={event => setApprovalNotes(current => ({ ...current, [proposal.proposalVersionId]: event.target.value }))} /></label>
                  <button type="button" className="btn sm" disabled={commandBusy} onClick={() => void approveProposal(proposal)}>Approve this exact revision</button>
                </>}
                {context.allowedActions.includes('proposal.dispatch') && proposal.approvalStatus === 'APPROVE' && ['NOT_DISPATCHED', 'BOUNCED'].includes(proposal.dispatchStatus) && <>
                  <label className="business-field" htmlFor={`business-proposal-route-${proposal.proposalVersionId}`}><span>Proposal email recipient</span><select id={`business-proposal-route-${proposal.proposalVersionId}`} value={routeValue} onChange={event => setProposalRouteIds(current => ({ ...current, [proposal.proposalVersionId]: event.target.value }))}><option value="">Select an active contact email</option>{routeOptions.map(route => <option key={route.id} value={route.id}>{route.clientName} · {route.contactName} · {route.email}</option>)}</select></label>
                  <button type="button" className="btn sm" disabled={commandBusy || !routeValue || proposal.documentStatus !== 'SUCCEEDED'} onClick={() => void dispatchProposal(proposal)}>Queue approved proposal email</button>
                </>}
                {proposal.dispatchStatus === 'FAILED' && <>
                  <p className="business-alert" role="alert">The provider rejected this dispatch. The engagement remains in proposal generation. Confirm provider configuration before retrying.</p>
                  {context.allowedActions.includes('proposal.dispatch') && <button type="button" className="btn sm" disabled={commandBusy || !proposal.dispatchId || !proposal.dispatchVersion} onClick={() => void retryProposalDispatch(proposal)}>Retry failed dispatch</button>}
                </>}
                {proposal.dispatchStatus === 'UNKNOWN' && <p className="business-alert" role="alert">The provider outcome is unknown. Reconcile the provider message before sending again; automatic retry is blocked to avoid a duplicate email.</p>}
              </li>;
            })}</ul> : <p className="business-muted">No proposal revisions exist in this workspace scope.</p>}
          </>}
        </section>}

        {context?.allowedActions.includes('risk.read') && preference && riskEngagement && <section className="business-directory-card" aria-labelledby="business-risk-engagement-heading">
          <div className="business-section-heading">
            <div><p className="business-eyebrow">ADMINISTRATION · GOVERNANCE</p><h2 id="business-risk-engagement-heading">Engagement acceptance and risk</h2></div>
            <label className="business-field" htmlFor="business-risk-engagement"><span>Engagement</span><select id="business-risk-engagement" value={riskEngagementId} onChange={event => setRiskEngagementId(event.target.value)}>
              {proposalWorkspace?.engagements.filter(item => item.lifecycleState !== 'ARCHIVED_READ_ONLY').map(item => <option key={item.id} value={item.id}>{item.clientName} · {item.code} · {item.lifecycleState.replaceAll('_', ' ')}</option>)}
            </select></label>
          </div>
          <BusinessAcceptanceRiskPanel workspaceId={preference.workspaceId} selected={preference} context={context}
            engagementId={riskEngagement.id} clientId={riskEngagement.clientId}
            engagementName={`${riskEngagement.clientName} · ${riskEngagement.code}`} files={files}
            onChanged={() => setRecordsKey(value => value + 1)} />
          {context.allowedActions.includes('billing.read') && <BusinessDeliveryPanel workspaceId={preference.workspaceId} selected={preference} context={context}
            engagement={riskEngagement} files={files} onChanged={() => setRecordsKey(value => value + 1)} />}
          {context.allowedActions.includes('planning.read') && <BusinessPlanningPanel workspaceId={preference.workspaceId} selected={preference}
            context={context} engagement={riskEngagement} onChanged={() => setRecordsKey(value => value + 1)} />}
          {context.allowedActions.includes('planning.read') && <BusinessTrialBalancePanel workspaceId={preference.workspaceId}
            selected={preference} context={context} engagement={riskEngagement} files={files}
            onChanged={() => setRecordsKey(value => value + 1)} />}
        </section>}

        {context?.allowedActions.includes('pbc.read') && preference && <BusinessPbcPanel workspaceId={preference.workspaceId}
          selected={preference} context={context} onChanged={() => setRecordsKey(value => value + 1)} />}

        {context?.allowedActions.includes('file.read') && context.actor.persona !== 'CLIENT' && <section className="business-directory-card" aria-labelledby="business-files-heading">
          <div className="business-section-heading">
            <div><p className="business-eyebrow">PRIVATE R2 OBJECT STORE · VERIFIED BYTES</p><h2 id="business-files-heading">Stored files</h2></div>
            <button type="button" className="btn sm" disabled={fileBusy} onClick={() => setRecordsKey(value => value + 1)}>Refresh files</button>
          </div>
          {fileError && <p className="business-alert" role="alert">{fileError}</p>}
          {fileMessage && <p className="business-command-message" role="status">{fileMessage}</p>}
          {context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER' ? <form className="business-form business-commercial-form" onSubmit={storeFirmFile}>
            <h3>Store a firm template or signature asset</h3>
            <div className="business-form-grid">
              <label className="business-field" htmlFor="business-file-purpose"><span>Purpose</span><select id="business-file-purpose" value={filePurpose} onChange={event => setFilePurpose(event.target.value as BusinessFilePurpose)}><option value="TEMPLATE">Approved document template</option><option value="SIGNATURE">Signature image</option><option value="SEAL">Firm seal image</option></select></label>
              <label className="business-field" htmlFor="business-file-input"><span>File</span><input ref={fileInput} id="business-file-input" type="file" accept=".pdf,.txt,.csv,.xlsx,.docx,.png,.jpg,.jpeg,.zip" onChange={event => { setSelectedUploadFile(event.currentTarget.files?.[0] ?? null); setFileError(''); setFileMessage(''); }} /><small>Raw bytes are sent to the Worker; maximum 25 MiB. MIME claims are checked against file signatures before commitment.</small></label>
            </div>
            <p className="business-note">The file remains a draft until the server verifies its byte count, digest and declared document type, then commits an immutable file version.</p>
            <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={fileBusy || !selectedUploadFile}>{fileBusy ? 'Verifying and storing…' : 'Store file'}</button></div>
          </form> : <p className="business-note">Internal PBC, TB and evidence uploads require a selected engagement. This view has no engagement selected.</p>}
          {files.length ? <ul className="business-record-list business-file-list">{files.map(file => <li key={file.id}>
            <strong>{file.originalName}</strong><span>{file.purpose} · {file.mediaType} · {(file.sizeBytes / 1024).toFixed(1)} KiB · v{file.version}</span><small>SHA-256 {file.sha256?.slice(0, 16)}… · committed {file.committedAt}</small>
            <button type="button" className="btn sm" disabled={downloadingFileId === file.id} onClick={() => void downloadStoredFile(file)}>{downloadingFileId === file.id ? 'Checking…' : 'Download verified bytes'}</button>
          </li>)}</ul> : <p className="business-muted">No committed files are visible in this request context.</p>}
        </section>}
      </>}
    </div>
  </main>;
}
