// Capacity, milestones and engagement filing controls for real BUSINESS records.
import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import { requireWorkspace } from './db';
import type { BusinessContext, BusinessMutation } from './business';
import { suggestMilestones, type SuggestedMilestoneCode } from '../src/shared/milestoneDefaults';

const id = z.uuid();
const date = z.iso.date();
const persona = z.enum(['PREPARER', 'REVIEWER', 'APPROVER']);
const phase = z.enum(['COMMERCIAL', 'PLANNING', 'FIELDWORK', 'REVIEW', 'REPORTING', 'ARCHIVE']);
const dailyMinutes = z.array(z.strictObject({ date, minutes: z.number().int().min(1).max(1440) })).min(1).max(366)
  .refine(days => new Set(days.map(day => day.date)).size === days.length, 'Each work date may appear only once.')
  .refine(days => days.reduce((sum, day) => sum + day.minutes, 0) <= 1000000, 'Planned minutes exceed the supported limit.');

const availabilitySet = z.strictObject({
  type: z.literal('staffing.availability.set'),
  payload: z.strictObject({ staffMemberId: id, workDate: date, scheduledMinutes: z.number().int().min(0).max(1440), expectedVersion: z.number().int().positive().optional() })
});
const leaveRecord = z.strictObject({
  type: z.literal('staffing.leave.record'),
  payload: z.strictObject({ staffMemberId: id, workDate: date, minutes: z.number().int().min(1).max(1440), reason: z.string().trim().min(10).max(2000) })
});
const staffingAssign = z.strictObject({
  type: z.literal('staffing.assign'),
  payload: z.strictObject({
    engagementId: id, staffMemberId: id, persona, phase, startDate: date, endDate: date,
    plannedMinutes: z.number().int().min(1).max(1000000), dailyMinutes
  }).refine(value => value.startDate <= value.endDate, { message: 'Assignment start date must not follow its end date.' })
    .refine(value => value.dailyMinutes.every(day => day.date >= value.startDate && day.date <= value.endDate), { message: 'Every explicitly scheduled day must fall inside the assignment dates.' })
    .refine(value => value.dailyMinutes.reduce((sum, day) => sum + day.minutes, 0) === value.plannedMinutes, { message: 'Daily assignments must sum exactly to planned minutes.' })
});
const capacityException = z.strictObject({
  type: z.literal('staffing.capacityException.approve'),
  payload: z.strictObject({ staffMemberId: id, workDate: date, excessMinutes: z.number().int().min(1).max(1440), reason: z.string().trim().min(10).max(2000) })
});
const milestoneSet = z.strictObject({
  type: z.literal('milestone.set'),
  payload: z.strictObject({
    engagementId: id, code: z.enum(['FIELDWORK_START', 'DRAFT_REPORT', 'FINAL_REPORT', 'STATUTORY_CUTOFF']),
    targetDate: date, sourceReference: z.string().trim().min(1).max(1000), expectedVersion: z.number().int().positive().optional()
  })
});
const milestoneApplyDefaults = z.strictObject({
  type: z.literal('milestone.applyDefaults'),
  payload: z.strictObject({
    engagementId: id, periodEnd: date, overwrite: z.boolean().default(false),
    suggestedDates: z.strictObject({ FIELDWORK_START: date, DRAFT_REPORT: date, FINAL_REPORT: date }).optional()
  })
});

export const businessPlanningCommands = [availabilitySet, leaveRecord, staffingAssign, capacityException, milestoneSet, milestoneApplyDefaults] as const;
export const businessPlanningCommandSchema = z.discriminatedUnion('type', businessPlanningCommands);
export type BusinessPlanningCommand = z.infer<typeof businessPlanningCommandSchema>;

export function isBusinessPlanningCommand(command: { type: string }): command is BusinessPlanningCommand {
  return command.type.startsWith('staffing.') || command.type === 'milestone.set' || command.type === 'milestone.applyDefaults';
}

type PlanningEngagement = { id: string; client_id: string; lifecycle_state: string; period_start: string; period_end: string; locked_at: string | null };

function requirePlanner(context: BusinessContext, action: string): void {
  if (!context.allowedActions.includes(action) || !['REVIEWER', 'APPROVER'].includes(context.actor.persona)) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only internal REVIEWER or APPROVER profiles can manage engagement planning.');
  }
}

function requirePartner(context: BusinessContext): void {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a PARTNER APPROVER can approve capacity exceptions and statutory cutoffs.');
  }
}

async function requirePlanningEngagement(env: Env, workspaceId: string, context: BusinessContext, engagementId: string, allowArchivedRead = false): Promise<PlanningEngagement> {
  const row = await env.DB.prepare(`SELECT id,client_id,lifecycle_state,period_start,period_end,locked_at
    FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId, engagementId).first<PlanningEngagement>();
  if (!row) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId !== row.client_id)
    || (context.scope.engagementId && context.scope.engagementId !== row.id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected planning context.');
  }
  if (!allowArchivedRead && (row.locked_at || row.lifecycle_state === 'ARCHIVED_READ_ONLY')) throw new ApiError('WORKSPACE_FROZEN', 'Archived engagements are read-only.');
  return row;
}

async function staffMember(env: Env, workspaceId: string, staffMemberId: string): Promise<{ id: string; grade: string; natural_person_key: string }> {
  const staff = await env.DB.prepare(`SELECT id,grade,natural_person_key FROM staff_members WHERE workspace_id=? AND id=? AND active=1`)
    .bind(workspaceId, staffMemberId).first<{ id: string; grade: string; natural_person_key: string }>();
  if (!staff) throw new ApiError('NOT_FOUND', 'The active staff member was not found.');
  return staff;
}

async function availabilityRow(env: Env, workspaceId: string, staffMemberId: string, workDate: string) {
  return env.DB.prepare(`SELECT id,version,scheduled_minutes,approved_leave_minutes FROM staff_availability
    WHERE workspace_id=? AND staff_member_id=? AND work_date=?`).bind(workspaceId, staffMemberId, workDate)
    .first<{ id: string; version: number; scheduled_minutes: number; approved_leave_minutes: number }>();
}

function requireGradeForPersona(value: string, grade: string): void {
  if (value === 'APPROVER' && grade !== 'PARTNER') throw new ApiError('PERSONA_ACTION_DENIED', 'APPROVER assignments require PARTNER grade.');
  if (value === 'REVIEWER' && !['MANAGER', 'SENIOR'].includes(grade)) throw new ApiError('PERSONA_ACTION_DENIED', 'REVIEWER assignments require MANAGER or SENIOR grade.');
}

// Returns all authoritative day capacity values without loading a workspace aggregate.
export async function getBusinessCapacity(env: Env, workspaceId: string, context: BusinessContext, from: string, to: string) {
  if (!context.allowedActions.includes('planning.read') || context.actor.persona === 'CLIENT') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Internal planning context is required for capacity records.');
  }
  const valid = z.iso.date().safeParse(from).success && z.iso.date().safeParse(to).success;
  if (!valid || from > to) throw new ApiError('VALIDATION_FAILED', 'Choose a valid inclusive date range.');
  const span = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (span > 366) throw new ApiError('VALIDATION_FAILED', 'Capacity views are limited to 366 days at a time.');
  const rows = await env.DB.prepare(`WITH assigned AS (
      SELECT a.staff_member_id,d.work_date,SUM(d.planned_minutes) AS assigned_minutes
      FROM engagement_assignment_days d JOIN engagement_assignments a ON a.workspace_id=d.workspace_id AND a.id=d.assignment_id
      WHERE a.workspace_id=? AND d.work_date BETWEEN ? AND ? GROUP BY a.staff_member_id,d.work_date
    ), exceptions AS (
      SELECT staff_member_id,work_date,SUM(excess_minutes) AS exception_minutes FROM capacity_exceptions
      WHERE workspace_id=? AND work_date BETWEEN ? AND ? GROUP BY staff_member_id,work_date
    )
    SELECT sm.id AS staff_member_id,sm.display_name,sm.grade,cal.work_date,sa.id AS availability_id,sa.version AS availability_version,
      sa.scheduled_minutes,sa.approved_leave_minutes,assigned.assigned_minutes,exceptions.exception_minutes
    FROM (
      SELECT staff_member_id,work_date FROM staff_availability WHERE workspace_id=? AND work_date BETWEEN ? AND ?
      UNION SELECT staff_member_id,work_date FROM assigned
    ) cal
    JOIN staff_members sm ON sm.workspace_id=? AND sm.id=cal.staff_member_id
    LEFT JOIN staff_availability sa ON sa.workspace_id=? AND sa.staff_member_id=cal.staff_member_id AND sa.work_date=cal.work_date
    LEFT JOIN assigned ON assigned.staff_member_id=cal.staff_member_id AND assigned.work_date=cal.work_date
    LEFT JOIN exceptions ON exceptions.staff_member_id=cal.staff_member_id AND exceptions.work_date=cal.work_date
    WHERE sm.active=1 ORDER BY cal.work_date,sm.display_name,sm.id`)
    .bind(workspaceId, from, to, workspaceId, from, to, workspaceId, from, to, workspaceId, workspaceId)
    .all<{ staff_member_id: string; display_name: string; grade: string; work_date: string; availability_id: string | null; availability_version: number | null; scheduled_minutes: number | null;
      approved_leave_minutes: number | null; assigned_minutes: number | null; exception_minutes: number | null }>();
  const staffDays = (rows.results ?? []).map(row => {
    const scheduled = row.scheduled_minutes;
    const leave = row.approved_leave_minutes ?? 0;
    const assigned = row.assigned_minutes ?? 0;
    const exception = row.exception_minutes ?? 0;
    const available = scheduled === null ? null : scheduled - leave;
    return { staffMemberId: row.staff_member_id, displayName: row.display_name, grade: row.grade, workDate: row.work_date,
      availabilityId: row.availability_id, availabilityVersion: row.availability_version,
      scheduledMinutes: scheduled, approvedLeaveMinutes: leave, availableMinutes: available, assignedMinutes: assigned,
      approvedExceptionMinutes: exception, overbookedMinutes: available === null ? null : Math.max(0, assigned - available - exception),
      capacityStatus: scheduled === null ? 'MISSING_CAPACITY' : assigned > available! + exception ? 'OVERBOOKED'
        : exception > 0 && assigned > available! ? 'EXCEPTION_APPROVED' : 'AVAILABLE' };
  });
  return { from, to, staffDays, overbookings: staffDays.filter(day => day.overbookedMinutes === null ? day.assignedMinutes > 0 : day.overbookedMinutes > 0) };
}

export async function getBusinessPlanningWorkspace(env: Env, workspaceId: string, context: BusinessContext, engagementId: string) {
  if (!context.allowedActions.includes('planning.read') || context.actor.persona === 'CLIENT') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Internal planning context is required for this engagement.');
  }
  const engagement = await requirePlanningEngagement(env, workspaceId, context, engagementId, true);
  const [staff, assignments, milestones, folders] = await Promise.all([
    env.DB.prepare(`SELECT id,display_name AS displayName,grade FROM staff_members WHERE workspace_id=? AND active=1 ORDER BY grade,display_name,id`)
      .bind(workspaceId).all<{ id: string; displayName: string; grade: string }>(),
    env.DB.prepare(`SELECT a.id,a.version,a.staff_member_id AS staffMemberId,sm.display_name AS displayName,sm.grade,a.persona,a.phase,
        a.start_date AS startDate,a.end_date AS endDate,a.planned_minutes AS plannedMinutes,
        COALESCE(json_group_array(json_object('date',d.work_date,'minutes',d.planned_minutes)) FILTER (WHERE d.id IS NOT NULL),'[]') AS dailyMinutes
      FROM engagement_assignments a JOIN staff_members sm ON sm.workspace_id=a.workspace_id AND sm.id=a.staff_member_id
      LEFT JOIN engagement_assignment_days d ON d.workspace_id=a.workspace_id AND d.assignment_id=a.id
      WHERE a.workspace_id=? AND a.engagement_id=? GROUP BY a.id ORDER BY a.phase,a.start_date,sm.display_name,a.id`)
      .bind(workspaceId, engagementId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,version,code,target_date AS targetDate,actual_date AS actualDate,source_reference AS sourceReference,
        approved_by_actor_id AS approvedByActorId FROM milestones WHERE workspace_id=? AND engagement_id=? ORDER BY target_date,code`)
      .bind(workspaceId, engagementId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT f.id,f.code,f.display_name AS displayName,f.ordinal,
        (SELECT COUNT(*) FROM file_versions fv WHERE fv.workspace_id=f.workspace_id AND fv.folder_id=f.id AND fv.state='COMMITTED') AS fileCount,
        CASE WHEN f.code='FINAL_SIGNED_ARCHIVE' THEN 1 ELSE 0 END AS readOnly
      FROM engagement_folders f WHERE f.workspace_id=? AND f.engagement_id=? ORDER BY f.ordinal`)
      .bind(workspaceId, engagementId).all<Record<string, unknown>>()
  ]);
  return { engagement: { id: engagement.id, clientId: engagement.client_id, lifecycleState: engagement.lifecycle_state,
      periodStart: engagement.period_start, periodEnd: engagement.period_end },
    staff: staff.results ?? [], assignments: (assignments.results ?? []).map(row => ({ ...row, dailyMinutes: JSON.parse(String(row.dailyMinutes)) })),
    milestones: milestones.results ?? [], folders: folders.results ?? [] };
}

export async function buildBusinessPlanningMutation(env: Env, workspaceId: string, context: BusinessContext,
  command: BusinessPlanningCommand, _commandId: string, now: string): Promise<BusinessMutation> {
  if (command.type === 'staffing.availability.set') {
    requirePlanner(context, 'staffing.manage');
    await staffMember(env, workspaceId, command.payload.staffMemberId);
    const prior = await availabilityRow(env, workspaceId, command.payload.staffMemberId, command.payload.workDate);
    if ((prior && command.payload.expectedVersion !== prior.version) || (!prior && command.payload.expectedVersion !== undefined)) {
      throw new ApiError('VERSION_CONFLICT', 'Staff availability changed. Reload the day before editing.');
    }
    if (prior && prior.approved_leave_minutes > command.payload.scheduledMinutes) {
      throw new ApiError('VALIDATION_FAILED', 'Scheduled minutes cannot be less than already approved leave.');
    }
    const existingLoad = await env.DB.prepare(`SELECT COALESCE(SUM(d.planned_minutes),0) AS assigned,
        COALESCE((SELECT SUM(x.excess_minutes) FROM capacity_exceptions x WHERE x.workspace_id=a.workspace_id
          AND x.staff_member_id=? AND x.work_date=?),0) AS exception_minutes
      FROM engagement_assignments a JOIN engagement_assignment_days d ON d.workspace_id=a.workspace_id AND d.assignment_id=a.id
      WHERE a.workspace_id=? AND a.staff_member_id=? AND d.work_date=?`)
      .bind(command.payload.staffMemberId, command.payload.workDate, workspaceId, command.payload.staffMemberId, command.payload.workDate)
      .first<{ assigned: number; exception_minutes: number }>();
    if ((existingLoad?.assigned ?? 0) > command.payload.scheduledMinutes - (prior?.approved_leave_minutes ?? 0) + (existingLoad?.exception_minutes ?? 0)) {
      throw new ApiError('GATE_BLOCKED', 'The new schedule would create unapproved over-capacity; preserve the recorded capacity or obtain a Partner exception.');
    }
    const rowId = prior?.id ?? crypto.randomUUID();
    const nextVersion = (prior?.version ?? 0) + 1;
    return { statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,94,CASE WHEN ((? IS NULL AND NOT EXISTS(SELECT 1 FROM staff_availability WHERE workspace_id=? AND staff_member_id=? AND work_date=?))
          OR (? IS NOT NULL AND EXISTS(SELECT 1 FROM staff_availability WHERE workspace_id=? AND staff_member_id=? AND work_date=? AND version=?
            AND approved_leave_minutes<=?))) THEN 1 ELSE 0 END`)
        .bind(workspaceId, prior?.version ?? null, workspaceId, command.payload.staffMemberId, command.payload.workDate,
          prior?.version ?? null, workspaceId, command.payload.staffMemberId, command.payload.workDate, prior?.version ?? 0, command.payload.scheduledMinutes),
      env.DB.prepare(`INSERT INTO staff_availability(id,workspace_id,staff_member_id,work_date,version,scheduled_minutes,approved_leave_minutes,updated_by_actor_id,updated_at)
        VALUES(?,?,?,?,1,?,0,?,?) ON CONFLICT(workspace_id,staff_member_id,work_date) DO UPDATE SET
        version=staff_availability.version+1,scheduled_minutes=excluded.scheduled_minutes,updated_by_actor_id=excluded.updated_by_actor_id,updated_at=excluded.updated_at
        WHERE staff_availability.version=? AND staff_availability.approved_leave_minutes<=excluded.scheduled_minutes`)
        .bind(rowId, workspaceId, command.payload.staffMemberId, command.payload.workDate, command.payload.scheduledMinutes, context.actor.id, now, prior?.version ?? 0)
    ], result: { availabilityId: rowId, staffMemberId: command.payload.staffMemberId, workDate: command.payload.workDate, version: nextVersion,
      availableMinutes: command.payload.scheduledMinutes - (prior?.approved_leave_minutes ?? 0) },
      entityType: 'STAFF_AVAILABILITY', entityId: rowId, beforeVersion: prior?.version ?? null, afterVersion: nextVersion };
  }

  if (command.type === 'staffing.leave.record') {
    requirePlanner(context, 'staffing.manage'); requirePartner(context);
    const staff = await staffMember(env, workspaceId, command.payload.staffMemberId);
    const availability = await availabilityRow(env, workspaceId, staff.id, command.payload.workDate);
    if (!availability) throw new ApiError('GATE_BLOCKED', 'Record the staff member’s scheduled working minutes before approving leave.');
    const actorStaff = await env.DB.prepare(`SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, context.actor.id).first<{ staff_member_id: string | null }>();
    if (actorStaff?.staff_member_id === staff.id) throw new ApiError('PERSONA_ACTION_DENIED', 'A staff member cannot approve their own leave.');
    if (availability.approved_leave_minutes + command.payload.minutes > availability.scheduled_minutes) {
      throw new ApiError('VALIDATION_FAILED', 'Approved leave cannot exceed the scheduled minutes for that date.');
    }
    const leaveId = crypto.randomUUID(); const decisionId = crypto.randomUUID();
    const snapshot = JSON.stringify({ actorId: context.actor.id, persona: context.actor.persona, displayName: context.actor.displayName,
      staffGrade: context.actor.staffGrade, assurance: 'SELF_ASSERTED' });
    return { statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,95,CASE WHEN EXISTS(SELECT 1 FROM staff_availability WHERE workspace_id=? AND staff_member_id=? AND work_date=? AND version=?
          AND approved_leave_minutes+?<=scheduled_minutes) THEN 1 ELSE 0 END`)
        .bind(workspaceId, workspaceId, staff.id, command.payload.workDate, availability.version, command.payload.minutes),
      env.DB.prepare(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,version,subject_type,subject_id,subject_version,
        decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id) VALUES(?,?,NULL,NULL,1,'STAFF_LEAVE',?,1,'APPROVE',?,?,?,NULL)`)
        .bind(decisionId, workspaceId, leaveId, command.payload.reason, snapshot, now),
      env.DB.prepare(`INSERT INTO leave_records(id,workspace_id,staff_member_id,work_date,minutes,reason,status,approved_by_actor_id,approval_decision_id,recorded_at)
        VALUES(?,?,?,?,?,?,'APPROVED',?,?,?)`).bind(leaveId, workspaceId, staff.id, command.payload.workDate, command.payload.minutes,
        command.payload.reason, context.actor.id, decisionId, now),
      env.DB.prepare(`UPDATE staff_availability SET approved_leave_minutes=approved_leave_minutes+?,version=version+1,updated_by_actor_id=?,updated_at=?
        WHERE workspace_id=? AND staff_member_id=? AND work_date=? AND version=? AND approved_leave_minutes+?<=scheduled_minutes`)
        .bind(command.payload.minutes, context.actor.id, now, workspaceId, staff.id, command.payload.workDate, availability.version, command.payload.minutes)
    ], result: { leaveRecordId: leaveId, approvalDecisionId: decisionId, availabilityVersion: availability.version + 1,
      approvedLeaveMinutes: availability.approved_leave_minutes + command.payload.minutes,
      availableMinutes: availability.scheduled_minutes - availability.approved_leave_minutes - command.payload.minutes },
      entityType: 'LEAVE_RECORD', entityId: leaveId, beforeVersion: null, afterVersion: 1 };
  }

  if (command.type === 'staffing.assign') {
    requirePlanner(context, 'staffing.manage');
    const engagement = await requirePlanningEngagement(env, workspaceId, context, command.payload.engagementId);
    if (!['PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION'].includes(engagement.lifecycle_state)) {
      throw new ApiError('INVALID_TRANSITION', 'Staff can be assigned during active planning or fieldwork only.');
    }
    const staff = await staffMember(env, workspaceId, command.payload.staffMemberId);
    requireGradeForPersona(command.payload.persona, staff.grade);
    const dayDates = command.payload.dailyMinutes.map(day => day.date);
    const dateSlots = dayDates.map(() => '?').join(',');
    const [availabilityRows, assignmentRows, exceptionRows] = await Promise.all([
      env.DB.prepare(`SELECT work_date,scheduled_minutes,approved_leave_minutes FROM staff_availability WHERE workspace_id=? AND staff_member_id=? AND work_date IN (${dateSlots})`)
        .bind(workspaceId, staff.id, ...dayDates).all<{ work_date: string; scheduled_minutes: number; approved_leave_minutes: number }>(),
      env.DB.prepare(`SELECT d.work_date,SUM(d.planned_minutes) AS minutes FROM engagement_assignment_days d
        JOIN engagement_assignments a ON a.workspace_id=d.workspace_id AND a.id=d.assignment_id
        WHERE a.workspace_id=? AND a.staff_member_id=? AND d.work_date IN (${dateSlots}) GROUP BY d.work_date`)
        .bind(workspaceId, staff.id, ...dayDates).all<{ work_date: string; minutes: number }>(),
      env.DB.prepare(`SELECT work_date,SUM(excess_minutes) AS minutes FROM capacity_exceptions
        WHERE workspace_id=? AND staff_member_id=? AND work_date IN (${dateSlots}) GROUP BY work_date`)
        .bind(workspaceId, staff.id, ...dayDates).all<{ work_date: string; minutes: number }>()
    ]);
    const availabilityByDate = new Map((availabilityRows.results ?? []).map(row => [row.work_date, row]));
    const assignedByDate = new Map((assignmentRows.results ?? []).map(row => [row.work_date, row.minutes]));
    const exceptionByDate = new Map((exceptionRows.results ?? []).map(row => [row.work_date, row.minutes]));
    const overbookings: Array<Record<string, unknown>> = [];
    const warnings: Array<Record<string, unknown>> = [];
    for (const day of command.payload.dailyMinutes) {
      const availability = availabilityByDate.get(day.date);
      if (!availability) throw new ApiError('GATE_BLOCKED', `Working capacity for ${day.date} is not recorded.`, { staffMemberId: staff.id, workDate: day.date });
      const capacity = availability.scheduled_minutes - availability.approved_leave_minutes;
      const assigned = (assignedByDate.get(day.date) ?? 0) + day.minutes;
      const approvedException = exceptionByDate.get(day.date) ?? 0;
      const excess = Math.max(0, assigned - capacity);
      if (excess > approvedException) overbookings.push({ workDate: day.date, availableMinutes: capacity, assignedMinutes: assigned, unapprovedExcessMinutes: excess - approvedException });
      else if (approvedException > 0) warnings.push({ workDate: day.date, approvedExceptionMinutes: approvedException, assignedMinutes: assigned, availableMinutes: capacity });
    }
    if (overbookings.length) throw new ApiError('GATE_BLOCKED', 'The assignment exceeds recorded staff capacity; obtain a Partner-approved capacity exception or change the schedule.', { overbookings });
    const assignmentId = crypto.randomUUID();
    const capacityGuard = env.DB.prepare(`WITH proposed AS (SELECT json_extract(value,'$.date') AS work_date,json_extract(value,'$.minutes') AS minutes FROM json_each(?))
      INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,96,CASE WHEN NOT EXISTS(SELECT 1 FROM proposed p LEFT JOIN staff_availability sa
        ON sa.workspace_id=? AND sa.staff_member_id=? AND sa.work_date=p.work_date
        WHERE sa.id IS NULL OR p.minutes+(SELECT COALESCE(SUM(d.planned_minutes),0) FROM engagement_assignment_days d
          JOIN engagement_assignments a ON a.workspace_id=d.workspace_id AND a.id=d.assignment_id
          WHERE a.workspace_id=? AND a.staff_member_id=? AND d.work_date=p.work_date)
          > sa.scheduled_minutes-sa.approved_leave_minutes+(SELECT COALESCE(SUM(x.excess_minutes),0) FROM capacity_exceptions x
            WHERE x.workspace_id=? AND x.staff_member_id=? AND x.work_date=p.work_date)) THEN 1 ELSE 0 END`)
      .bind(JSON.stringify(command.payload.dailyMinutes), workspaceId, workspaceId, staff.id, workspaceId, staff.id, workspaceId, staff.id);
    const statements: D1PreparedStatement[] = [capacityGuard, env.DB.prepare(`INSERT INTO engagement_assignments(id,workspace_id,version,client_id,engagement_id,staff_member_id,persona,phase,
      start_date,end_date,planned_minutes,created_by_actor_id,created_at) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?)`)
      .bind(assignmentId, workspaceId, engagement.client_id, engagement.id, staff.id, command.payload.persona, command.payload.phase,
        command.payload.startDate, command.payload.endDate, command.payload.plannedMinutes, context.actor.id, now),
    ...command.payload.dailyMinutes.map(day => env.DB.prepare(`INSERT INTO engagement_assignment_days(id,workspace_id,assignment_id,work_date,planned_minutes)
      VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(), workspaceId, assignmentId, day.date, day.minutes))];
    return { statements, result: { assignmentId, version: 1, capacityWarnings: warnings }, entityType: 'ENGAGEMENT_ASSIGNMENT', entityId: assignmentId,
      beforeVersion: null, afterVersion: 1, auditDetails: { engagementId: engagement.id, staffMemberId: staff.id, persona: command.payload.persona, phase: command.payload.phase } };
  }

  if (command.type === 'staffing.capacityException.approve') {
    requirePlanner(context, 'staffing.manage'); requirePartner(context);
    const staff = await staffMember(env, workspaceId, command.payload.staffMemberId);
    const availability = await availabilityRow(env, workspaceId, staff.id, command.payload.workDate);
    if (!availability) throw new ApiError('GATE_BLOCKED', 'A capacity exception cannot invent availability; record the actual working schedule first.');
    const currentException = await env.DB.prepare(`SELECT COALESCE(SUM(excess_minutes),0) AS minutes FROM capacity_exceptions
      WHERE workspace_id=? AND staff_member_id=? AND work_date=?`).bind(workspaceId, staff.id, command.payload.workDate).first<{ minutes: number }>();
    if ((currentException?.minutes ?? 0) + command.payload.excessMinutes > 1440) {
      throw new ApiError('VALIDATION_FAILED', 'Total approved exception minutes for one staff member and date cannot exceed one day.');
    }
    const exceptionId = crypto.randomUUID(); const decisionId = crypto.randomUUID();
    const snapshot = JSON.stringify({ actorId: context.actor.id, persona: context.actor.persona, displayName: context.actor.displayName,
      staffGrade: context.actor.staffGrade, assurance: 'SELF_ASSERTED' });
    return { statements: [
      env.DB.prepare(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,version,subject_type,subject_id,subject_version,
        decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id) VALUES(?,?,NULL,NULL,1,'CAPACITY_EXCEPTION',?,1,'APPROVE',?,?,?,NULL)`)
        .bind(decisionId, workspaceId, exceptionId, command.payload.reason, snapshot, now),
      env.DB.prepare(`INSERT INTO capacity_exceptions(id,workspace_id,staff_member_id,work_date,excess_minutes,reason,approval_decision_id,approved_by_actor_id,approved_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(exceptionId, workspaceId, staff.id, command.payload.workDate, command.payload.excessMinutes,
        command.payload.reason, decisionId, context.actor.id, now)
    ], result: { exceptionId, approvalDecisionId: decisionId, staffMemberId: staff.id, workDate: command.payload.workDate,
      excessMinutes: command.payload.excessMinutes }, entityType: 'CAPACITY_EXCEPTION', entityId: exceptionId, beforeVersion: null, afterVersion: 1 };
  }

  if (command.type === 'milestone.applyDefaults') {
    const engagement = await requirePlanningEngagement(env, workspaceId, context, command.payload.engagementId);
    requirePlanner(context, 'staffing.manage');
    if (command.payload.periodEnd !== engagement.period_end) {
      throw new ApiError('VALIDATION_FAILED', 'The suggested period end must match the engagement period end.');
    }
    const defaults = suggestMilestones(engagement.period_end);
    const dates = { ...defaults, ...command.payload.suggestedDates };
    const sourceFor = () => `Suggested from period end ${engagement.period_end} (default rule v1)`;
    const existingResult = await env.DB.prepare(`SELECT id,code,version,target_date FROM milestones
      WHERE workspace_id=? AND engagement_id=? AND code IN ('FIELDWORK_START','DRAFT_REPORT','FINAL_REPORT')`)
      .bind(workspaceId, engagement.id).all<{ id: string; code: SuggestedMilestoneCode; version: number; target_date: string }>();
    const existing = new Map((existingResult.results ?? []).map(row => [row.code, row]));
    const cutoffRow = await env.DB.prepare(`SELECT target_date FROM milestones
      WHERE workspace_id=? AND engagement_id=? AND code='STATUTORY_CUTOFF'`)
      .bind(workspaceId, engagement.id).first<{ target_date: string }>();
    const cutoff = cutoffRow?.target_date ?? null;
    const statements: D1PreparedStatement[] = [];
    const applied: Array<{ code: SuggestedMilestoneCode; targetDate: string; version: number }> = [];
    const preserved: SuggestedMilestoneCode[] = [];
    const skipped: Array<{ code: SuggestedMilestoneCode; reason: string }> = [];
    const codes: SuggestedMilestoneCode[] = ['FIELDWORK_START', 'DRAFT_REPORT', 'FINAL_REPORT'];
    for (const [index, code] of codes.entries()) {
      const prior = existing.get(code);
      if (prior && !command.payload.overwrite) { preserved.push(code); continue; }
      if (code !== 'FIELDWORK_START' && (!cutoff || dates[code] > cutoff)) {
        skipped.push({ code, reason: !cutoff ? 'Record the firm-supplied statutory cutoff first.' : `Suggested date exceeds the recorded cutoff ${cutoff}.` });
        continue;
      }
      const rowId = prior?.id ?? crypto.randomUUID();
      const nextVersion = (prior?.version ?? 0) + 1;
      const sequence = 100 + index;
      statements.push(env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,?,CASE WHEN
          ((? IS NULL AND NOT EXISTS(SELECT 1 FROM milestones WHERE workspace_id=? AND engagement_id=? AND code=?))
            OR (? IS NOT NULL AND EXISTS(SELECT 1 FROM milestones WHERE workspace_id=? AND id=? AND engagement_id=? AND code=? AND version=?)))
          AND (? NOT IN ('DRAFT_REPORT','FINAL_REPORT') OR EXISTS(SELECT 1 FROM milestones
            WHERE workspace_id=? AND engagement_id=? AND code='STATUTORY_CUTOFF' AND target_date>=?))
          THEN 1 ELSE 0 END`)
        .bind(workspaceId, sequence, prior?.id ?? null, workspaceId, engagement.id, code, prior?.id ?? null,
          workspaceId, prior?.id ?? null, engagement.id, code, prior?.version ?? null, code, workspaceId, engagement.id, dates[code]));
      if (prior) {
        statements.push(env.DB.prepare(`UPDATE milestones SET version=version+1,target_date=?,source_reference=?,approved_by_actor_id=NULL,updated_at=?
          WHERE workspace_id=? AND id=? AND version=?`)
          .bind(dates[code], sourceFor(), now, workspaceId, prior.id, prior.version));
      } else {
        statements.push(env.DB.prepare(`INSERT INTO milestones(id,workspace_id,version,client_id,engagement_id,code,target_date,actual_date,
          source_reference,approved_by_actor_id,created_by_actor_id,created_at,updated_at) VALUES(?,?,1,?,?,?, ?,NULL,?,NULL,?,?,?)`)
          .bind(rowId, workspaceId, engagement.client_id, engagement.id, code, dates[code], sourceFor(), context.actor.id, now, now));
      }
      applied.push({ code, targetDate: dates[code], version: nextVersion });
    }
    return { statements, result: { engagementId: engagement.id, periodEnd: engagement.period_end, applied, preserved, skipped },
      entityType: 'MILESTONE_SCHEDULE', entityId: engagement.id, beforeVersion: null,
      afterVersion: applied.reduce((maximum, item) => Math.max(maximum, item.version), 1) };
  }

  const payload = command.payload;
  const engagement = await requirePlanningEngagement(env, workspaceId, context, payload.engagementId);
  requirePlanner(context, 'staffing.manage');
  if (payload.code === 'STATUTORY_CUTOFF') requirePartner(context);
  const prior = await env.DB.prepare(`SELECT id,version,target_date FROM milestones WHERE workspace_id=? AND engagement_id=? AND code=?`)
    .bind(workspaceId, engagement.id, payload.code).first<{ id: string; version: number; target_date: string }>();
  if ((prior && payload.expectedVersion !== prior.version) || (!prior && payload.expectedVersion !== undefined)) {
    throw new ApiError('VERSION_CONFLICT', 'The engagement milestone changed. Reload before editing.');
  }
  if (payload.code === 'DRAFT_REPORT' || payload.code === 'FINAL_REPORT') {
    const cutoffRow = await env.DB.prepare(`SELECT target_date FROM milestones
      WHERE workspace_id=? AND engagement_id=? AND code='STATUTORY_CUTOFF'`).bind(workspaceId, engagement.id).first<{ target_date: string }>();
    const cutoff = cutoffRow?.target_date ?? null;
    if (!cutoff) throw new ApiError('GATE_BLOCKED', 'Record the firm-supplied statutory cutoff and its source before setting report milestones.');
    if (payload.targetDate > cutoff) throw new ApiError('VALIDATION_FAILED', `The ${payload.code === 'FINAL_REPORT' ? 'final' : 'draft'} report target cannot exceed the recorded cutoff ${cutoff}.`);
  }
  if (payload.code === 'STATUTORY_CUTOFF') {
    const lateMilestone = await env.DB.prepare(`SELECT code,target_date FROM milestones WHERE workspace_id=? AND engagement_id=?
      AND code IN ('DRAFT_REPORT','FINAL_REPORT') AND target_date>? ORDER BY target_date DESC LIMIT 1`)
      .bind(workspaceId, engagement.id, payload.targetDate).first<{ code: string; target_date: string }>();
    if (lateMilestone) throw new ApiError('VALIDATION_FAILED', `The recorded ${lateMilestone.code === 'FINAL_REPORT' ? 'final' : 'draft'} report target ${lateMilestone.target_date} exceeds the proposed cutoff.`);
  }
  const idValue = prior?.id ?? crypto.randomUUID();
  const nextVersion = (prior?.version ?? 0) + 1;
  const approvedBy = payload.code === 'STATUTORY_CUTOFF' ? context.actor.id : null;
  const versionGuard = env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
    SELECT ?,97,CASE WHEN
      ((? IS NULL AND NOT EXISTS(SELECT 1 FROM milestones WHERE workspace_id=? AND engagement_id=? AND code=?))
        OR (? IS NOT NULL AND EXISTS(SELECT 1 FROM milestones WHERE workspace_id=? AND id=? AND engagement_id=? AND code=? AND version=?)))
      AND (? NOT IN ('DRAFT_REPORT','FINAL_REPORT') OR EXISTS(SELECT 1 FROM milestones
        WHERE workspace_id=? AND engagement_id=? AND code='STATUTORY_CUTOFF' AND target_date>=?))
      AND (?<>'STATUTORY_CUTOFF' OR NOT EXISTS(SELECT 1 FROM milestones WHERE workspace_id=? AND engagement_id=?
        AND code IN ('DRAFT_REPORT','FINAL_REPORT') AND target_date>?))
      THEN 1 ELSE 0 END`)
    .bind(workspaceId, prior?.id ?? null, workspaceId, engagement.id, payload.code, prior?.id ?? null,
      workspaceId, prior?.id ?? null, engagement.id, payload.code, prior?.version ?? null,
      payload.code, workspaceId, engagement.id, payload.targetDate,
      payload.code, workspaceId, engagement.id, payload.targetDate);
  const statements = prior ? [versionGuard, env.DB.prepare(`UPDATE milestones SET version=version+1,target_date=?,source_reference=?,approved_by_actor_id=?,updated_at=?
      WHERE workspace_id=? AND id=? AND version=?`).bind(payload.targetDate, payload.sourceReference, approvedBy, now, workspaceId, prior.id, prior.version)]
    : [versionGuard, env.DB.prepare(`INSERT INTO milestones(id,workspace_id,version,client_id,engagement_id,code,target_date,actual_date,source_reference,approved_by_actor_id,
      created_by_actor_id,created_at,updated_at) VALUES(?,?,1,?,?,?, ?,NULL,?,?,?,?,?)`)
      .bind(idValue, workspaceId, engagement.client_id, engagement.id, payload.code, payload.targetDate, payload.sourceReference, approvedBy, context.actor.id, now, now)];
  return { statements, result: { milestoneId: idValue, code: payload.code, targetDate: payload.targetDate, version: nextVersion,
    sourceReference: payload.sourceReference, approvedByActorId: approvedBy }, entityType: 'MILESTONE', entityId: idValue,
    beforeVersion: prior?.version ?? null, afterVersion: nextVersion };
}

export async function listBusinessEngagementFolders(env: Env, workspaceId: string, context: BusinessContext, engagementId: string) {
  const workspace = await requireWorkspace(env, workspaceId);
  if (workspace.data_mode !== 'BUSINESS') throw new ApiError('BAD_REQUEST', 'Engagement folders require a BUSINESS workspace.');
  if (!context.allowedActions.includes('engagement.read') || context.actor.persona === 'CLIENT') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Internal engagement access is required to view the folder taxonomy.');
  }
  const engagement = await requirePlanningEngagement(env, workspaceId, context, engagementId, true);
  const result = await env.DB.prepare(`SELECT f.id,f.code,f.display_name AS displayName,f.ordinal,
      (SELECT COUNT(*) FROM file_versions fv WHERE fv.workspace_id=f.workspace_id AND fv.folder_id=f.id AND fv.state='COMMITTED') AS fileCount,
      CASE WHEN f.code='FINAL_SIGNED_ARCHIVE' THEN 1 ELSE 0 END AS readOnly
    FROM engagement_folders f WHERE f.workspace_id=? AND f.engagement_id=? ORDER BY f.ordinal`)
    .bind(workspaceId, engagement.id).all<Record<string, unknown>>();
  return { folders: result.results ?? [] };
}

export async function provisionEngagementFolders(env: Env, workspaceId: string, clientId: string, engagementId: string,
  clearanceId: string, now: string): Promise<{ statements: D1PreparedStatement[]; folders: Array<{ id: string; code: string; displayName: string; ordinal: number }> }> {
  const existing = await env.DB.prepare(`SELECT id,code,display_name AS displayName,ordinal FROM engagement_folders
    WHERE workspace_id=? AND engagement_id=? ORDER BY ordinal`).bind(workspaceId, engagementId)
    .all<{ id: string; code: string; displayName: string; ordinal: number }>();
  if ((existing.results?.length ?? 0) !== 0 && (existing.results?.length ?? 0) !== 5) {
    throw new ApiError('GATE_BLOCKED', 'The engagement folder taxonomy is incomplete; automatic provisioning will not overwrite partial work.');
  }
  const definitions = [
    ['ADMIN_PLANNING','01_Administration & Planning'], ['TB_SCHEDULES','02_Trial Balance & Schedules'],
    ['FIELDWORK_TESTING','03_Fieldwork & Testing'], ['DRAFTS_DELIVERABLES','04_Drafts & Deliverables'],
    ['FINAL_SIGNED_ARCHIVE','05_Final Signed Archive']
  ] as const;
  if (existing.results?.length === 5) return { statements: [], folders: existing.results };
  const folders = definitions.map(([code, displayName], index) => ({ id: crypto.randomUUID(), code, displayName, ordinal: index + 1 }));
  const statements = folders.map(folder => env.DB.prepare(`INSERT INTO engagement_folders(id,workspace_id,version,client_id,engagement_id,code,display_name,ordinal,created_from_clearance_id,created_at)
    VALUES(?,?,1,?,?,?,?,?,?,?)`).bind(folder.id, workspaceId, clientId, engagementId, folder.code, folder.displayName, folder.ordinal, clearanceId, now));
  return { statements, folders };
}
