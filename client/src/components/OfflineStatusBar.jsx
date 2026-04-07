// This component is now obsolete. Please use <SyncStatusBar /> instead.
export default function OfflineStatusBar() {
  return (
    <div style={{ padding: 12, background: 'var(--warning)', color: 'var(--on-accent)', textAlign: 'center', borderRadius: 8 }}>
      OfflineStatusBar is obsolete. Please use <b>SyncStatusBar</b> for sync status UI.
    </div>
  );
}
