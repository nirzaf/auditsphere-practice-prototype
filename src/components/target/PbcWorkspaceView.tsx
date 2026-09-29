import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { isClientRole, visibleEngagementIds } from '../../services/guards';
import { persistArtifact } from '../../services/artifactStore';
import { sha256OfFile } from '../../services/fileMetadata';
import { validatePbcUpload } from '../../services/pbcUpload';
import { ActionButton, Field, TargetForm, value, type TargetViewProps } from './TargetCommon';
export function PbcWorkspaceView(props: TargetViewProps & { client?: boolean }) {
  const s = prototypeStore.getSnapshot(),
    allowed = visibleEngagementIds(s),
    e = s.engagements.find(
      (e) => e.id === s.selectedEngagement && (allowed === 'ALL' || allowed.includes(e.id))
    );
  if (!e)
    return (
      <section className="panel panel-pad">
        <h2>No authorized engagement selected</h2>
        <p>Select an engagement within your current access scope.</p>
      </section>
    );
  const client = isClientRole(s.currentRole),
    contacts = s.contacts.filter((c) => c.clientId === e.client && c.active);
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <h2>{client ? 'Client PBC workspace' : 'M365 workspace & client PBC'}</h2>
        <p>
          {s.clients.find((c) => c.id === e.client)?.name} · {e.id} · {e.period}
        </p>
        <p className="caption">
          Local simulation. Files are retained in this browser’s artifact store; no email or
          SharePoint transmission occurs.
        </p>
        {client ? (
          <ActionButton action={() => prototypeStore.lifecycle.simulatePasswordChange()}>
            Simulate portal password change
          </ActionButton>
        ) : (
          <>
            <ActionButton
              action={() => prototypeStore.prepareClientWorkspace(e.client, e.year, e.id)}
            >
              Prepare engagement workspace
            </ActionButton>
            <ActionButton
              action={() =>
                prototypeStore.lifecycle.verifyWorkspaceAccess(
                  e.id,
                  'Five engagement folders and client-scoped access inspected in the simulation.'
                )
              }
            >
              Verify workspace access
            </ActionButton>
            <p>{e.auditLifecycle?.workspace?.path || 'Workspace not prepared'}</p>
            {(s.folders || [])
              .filter((f) => f.engagementId === e.id)
              .map((f) => (
                <p key={f.path}>{f.label || f.path}</p>
              ))}
          </>
        )}
      </section>
      {client && s.currentRole === 'client_admin' && (
        <TargetForm
          title="Delegate PBC contribution"
          button="Record scoped delegation"
          onRegisterUnsavedForm={props.onRegisterUnsavedForm}
          onCommit={(d) => prototypeStore.lifecycle.delegatePortal(e.id, value(d, 'user'))}
        >
          <Field label="Existing scoped client contributor" name="user">
            {s.users
              .filter(
                (u) =>
                  ['client_admin', 'client_finance'].includes(u.role) && u.id !== s.currentUserId
              )
              .filter((u) => {
                const v = visibleEngagementIds(s, u.id);
                return v === 'ALL' || v.includes(e.id);
              })
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Field>
          <p className="caption">
            Delegation records the handoff and does not create identities or expand access.
          </p>
        </TargetForm>
      )}
      {!client && (
        <TargetForm
          title="Draft a client information request"
          button="Create PBC request"
          formId="pbc-create"
          onRegisterUnsavedForm={props.onRegisterUnsavedForm}
          onCommit={(d) =>
            prototypeStore.addPbcRequest(e.id, {
              id: `PBC-${crypto.randomUUID()}`,
              title: value(d, 'title'),
              category: value(d, 'category'),
              description: value(d, 'description'),
              owner: s.currentPerson,
              contributor: value(d, 'recipient'),
              due: value(d, 'due'),
              status: 'Draft',
              version: 1,
              thread: []
            })
          }
        >
          <Field label="Request title" name="title" />
          <Field label="Category" name="category" defaultValue="Audit evidence" />
          <Field label="Request details" name="description" type="textarea" />
          <Field label="Client recipient" name="recipient">
            {contacts.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </Field>
          <Field label="Due date" name="due" type="date" defaultValue={s.asOfDate} />
        </TargetForm>
      )}
      {e.pbc
        .filter((p) => !client || p.status !== 'Draft')
        .map((p) => (
          <section key={p.id} className="panel panel-pad">
            <h3>
              {p.title} · {p.status}
            </h3>
            <p>{p.description}</p>
            <p className="caption">
              Recipient: {p.contributor} · due: {p.due} · response revision: {p.version}
            </p>
            {!client && p.status === 'Draft' && (
              <ActionButton action={() => prototypeStore.presentPbcRequest(e.id, p.id)}>
                Send PBC request (simulation)
              </ActionButton>
            )}
            {client && ['Requested', 'Needs clarification', 'Received'].includes(p.status) && (
              <TargetForm
                title={`Upload response to ${p.title}`}
                button="Upload client file locally"
                onRegisterUnsavedForm={props.onRegisterUnsavedForm}
                onCommit={async (d) => {
                  const file = d.get('file') as File;
                  const error = validatePbcUpload(file);
                  if (error) throw Error(error);
                  const id = `DOC-PBC-${crypto.randomUUID()}`,
                    sha256 = await sha256OfFile(file),
                    blob = new Blob([file], { type: file.type || 'application/octet-stream' });
                  await persistArtifact(
                    {
                      id,
                      name: file.name,
                      kind: 'PBC',
                      mimeType: blob.type,
                      size: blob.size,
                      sha256
                    },
                    blob
                  );
                  prototypeStore.uploadPbcResponse(e.id, p.id, {
                    id,
                    name: file.name,
                    size: file.size,
                    sha256,
                    type: file.type
                  });
                }}
              >
                <label className="target-field">
                  Response file
                  <input name="file" type="file" required />
                </label>
              </TargetForm>
            )}
            {!client && p.status === 'Received' && (
              <ActionButton action={() => prototypeStore.acceptPbcResponse(e.id, p.id)}>
                Accept response evidence
              </ActionButton>
            )}
            {!client && ['Received', 'Accepted'].includes(p.status) && (
              <TargetForm
                title={`Clarification for ${p.title}`}
                button="Return clarification"
                onRegisterUnsavedForm={props.onRegisterUnsavedForm}
                onCommit={(d) =>
                  prototypeStore.requestPbcClarification(e.id, p.id, value(d, 'note'))
                }
              >
                <Field label="Clarification note" name="note" type="textarea" />
              </TargetForm>
            )}
            {p.sharedFiles?.map((f) => (
              <p key={f.id}>
                {f.name} · v{f.version}
              </p>
            ))}
          </section>
        ))}
    </div>
  );
}
