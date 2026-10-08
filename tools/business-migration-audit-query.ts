const TARGET_TABLES = [
  'clients', 'contacts', 'leads', 'proposals', 'engagements', 'invoices', 'firm_credit_notes',
  'receipt_vouchers', 'payments', 'firm_time_entries', 'engagement_budgets', 'risk_assessments', 'procedures',
  'sample_populations', 'evidence_records', 'findings', 'audit_adjustments', 'confirmations',
  'file_versions', 'firm_profiles'
] as const;

/** Build one read-only D1 snapshot query for the migration audit. */
export function buildMigrationAuditSnapshotQuery(workspaceId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new Error('Workspace ID must be a valid UUID.');
  }
  const id = `'${workspaceId}'`;
  const targetUnion = TARGET_TABLES.map(table => `SELECT '${table}' AS kind,id FROM ${table} WHERE workspace_id=${id}`).join(' UNION ALL ');
  const targetFieldUnion = [
    `SELECT 'clients' AS kind,id,json_object('code',code,'legal_name',legal_name,'trading_name',trading_name,'entity_type',entity_type,'parent_client_id',parent_client_id,'commercial_registration',commercial_registration,'tax_id',tax_id,'industry',industry,'address',address,'country_code',country_code,'active',active) AS fields_json FROM clients WHERE workspace_id=${id}`,
    `SELECT 'contacts' AS kind,id,json_object('client_id',client_id,'full_name',full_name,'email',email,'phone',phone,'title',title,'role',role,'is_primary',is_primary,'active',active,'effective_from',effective_from,'effective_to',effective_to) AS fields_json FROM contacts WHERE workspace_id=${id}`
  ].join(' UNION ALL ');
  const targetMoneyUnion = [
    `SELECT 'invoices' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(total_minor),0) AS TEXT) AS amount_minor FROM invoices WHERE workspace_id=${id}`,
    `SELECT 'payments' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(amount_minor),0) AS TEXT) AS amount_minor FROM payments WHERE workspace_id=${id}`,
    `SELECT 'receipt_vouchers' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(p.amount_minor),0) AS TEXT) AS amount_minor FROM receipt_vouchers rv LEFT JOIN payments p ON p.workspace_id=rv.workspace_id AND p.id=rv.payment_id WHERE rv.workspace_id=${id}`,
    `SELECT 'firm_credit_notes' AS kind,CAST(COUNT(*) AS TEXT) AS row_count,CAST(COALESCE(SUM(amount_minor),0) AS TEXT) AS amount_minor FROM firm_credit_notes WHERE workspace_id=${id}`
  ].join(' UNION ALL ');
  return `SELECT json_object(
    'workspace',json_object('id',w.id,'schema_version',w.schema_version,'data_mode',w.data_mode),
    'entities',json(COALESCE((SELECT json_group_array(json_object('entity_kind',e.entity_kind,'entity_id',e.entity_id,'payload_json',e.payload_json)) FROM workspace_entities e WHERE e.workspace_id=w.id AND e.deleted_at IS NULL),'[]')),
    'rootDocuments',json(COALESCE((SELECT json_group_array(json_object('document_key',d.document_key,'payload_json',d.payload_json)) FROM workspace_root_documents d WHERE d.workspace_id=w.id),'[]')),
    'files',json(COALESCE((SELECT json_group_array(json_object('id',f.id,'r2_key',f.r2_key,'original_name',f.original_name,'size_bytes',f.size_bytes,'sha256',f.sha256,'state',f.state)) FROM file_objects f WHERE f.workspace_id=w.id AND f.deleted_at IS NULL),'[]')),
    'idMaps',json(COALESCE((SELECT json_group_array(json_object('source_kind',m.source_kind,'source_id',m.source_id,'target_kind',m.target_kind,'target_id',m.target_id)) FROM migration_id_map m WHERE m.workspace_id=w.id),'[]')),
    'targetRows',json(COALESCE((SELECT json_group_array(json_object('kind',t.kind,'id',t.id)) FROM (${targetUnion}) t),'[]')),
    'targetFields',json(COALESCE((SELECT json_group_array(json_object('kind',t.kind,'id',t.id,'fields',json(t.fields_json))) FROM (${targetFieldUnion}) t),'[]')),
    'targetMoneyTotals',json(COALESCE((SELECT json_group_array(json_object('kind',t.kind,'row_count',t.row_count,'amount_minor',t.amount_minor)) FROM (${targetMoneyUnion}) t),'[]'))
  ) AS snapshot_json FROM workspaces w WHERE w.id=${id}`;
}
