# PBC staff–client conversations

Each current PBC request has an attributed timeline in the staff Documents workspace and client portal. Replies show author, staff/client identity, timestamp and message. Staff-only historical entries are excluded from the client timeline. Files are available in the shared-files list and linked to their corresponding upload/reply messages; older records without verified original metadata are explicitly marked unavailable.

Managers, Partners, Preparers and Reviewers can reply and attach an optional file. The named client contributor can reply after first-login password reset; client files use the existing PBC evidence upload form so submission versions, rejection/re-upload and approval retain their audit semantics. Staff attachments do not change the client's evidence revision or acceptance status. A staff reply is explicitly client-visible, not an internal note or an email dispatch.

Commands enforce scope, identity, permitted roles, message length (2,000 characters), file types and the existing 10 MB limit. Draft/cancelled requests, released engagements and frozen archives reject replies. Existing internal history and all upload revisions are retained. Shared attachment originals join the archive's verified copies; missing bytes remain an explicit archive limitation.

This is a synthetic prototype. File bytes are stored in browser IndexedDB and downloads verify their size, MIME type and SHA-256. Cloud demo snapshots sync conversation/file metadata only: a separate browser cannot download an original that was never stored there. No cross-device file transport, email delivery or production authentication is claimed.

Verification: 427 unit tests pass. The full 16-test Chrome suite passes, including the extended visible journey: client evidence upload, staff reply with a genuine CSV attachment, client reply, staff visibility and exact-byte client download. After final role-display/archive changes, the visible journey and reporting/archive cases are rerun as focused checks. Production build passes.
