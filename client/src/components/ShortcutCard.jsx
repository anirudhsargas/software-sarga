import React from 'react';
import { Zap, Pencil, Trash2, FileText, CreditCard, Stamp, Image, BookOpen, Printer, Camera, Scissors, Copy, Tag } from 'lucide-react';

const colorMap = {
  purple: { bg: '#EEEDFE', fg: '#3C3489' },
  teal:   { bg: '#E1F5EE', fg: '#0F6E56' },
  blue:   { bg: '#E6F1FB', fg: '#185FA5' },
  amber:  { bg: '#FAEEDA', fg: '#854F0B' },
  pink:   { bg: '#FBEAF0', fg: '#993556' },
  green:  { bg: '#EAF3DE', fg: '#3B6D11' },
};

const iconMap = {
  bolt: Zap,
  file: FileText,
  card: CreditCard,
  stamp: Stamp,
  image: Image,
  book: BookOpen,
  printer: Printer,
  camera: Camera,
  scissors: Scissors,
  copy: Copy,
  tag: Tag,
};

const ShortcutCard = React.memo(({ shortcut, onTap, onEdit, onDelete, editable }) => {
  const colors = colorMap[shortcut.color] || colorMap.purple;
  const Icon = iconMap[shortcut.icon_name] || Zap;

  return (
    <div
      className="shortcut-card"
      style={{
        background: colors.bg,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-14)',
        cursor: 'pointer',
        position: 'relative',
        minHeight: 140,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        transition: 'transform 0.12s, box-shadow 0.12s',
        border: '1px solid transparent',
      }}
      onClick={() => onTap?.(shortcut)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        const actions = e.currentTarget.querySelector('.shortcut-card__actions');
        if (actions) actions.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
        const actions = e.currentTarget.querySelector('.shortcut-card__actions');
        if (actions) actions.style.opacity = '0';
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(shortcut); } }}
    >
      {editable && (
        <div
          className="shortcut-card__actions"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 4,
            opacity: 0,
            transition: 'opacity 0.15s',
          }}
        >
          <button
            className="shortcut-card__action"
            style={{
              background: 'var(--surface-blur)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              padding: 4,
              cursor: 'pointer',
              color: colors.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => { e.stopPropagation(); onEdit?.(shortcut); }}
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            className="shortcut-card__action"
            style={{
              background: 'var(--surface-blur)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => { e.stopPropagation(); onDelete?.(shortcut); }}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: colors.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-inverse)',
          flexShrink: 0,
        }}
      >
        <Icon size={20} aria-hidden="true" />
      </div>

      <div style={{ fontWeight: 500, fontSize: 14, color: colors.fg }}>
        {shortcut.name}
      </div>

      <div
        style={{
          fontSize: 12,
          color: shortcut.color === 'purple' ? '#26215C' : shortcut.color === 'teal' ? '#085041' : colors.fg,
          opacity: (shortcut.color === 'purple' || shortcut.color === 'teal') ? 1 : 0.7,
        }}
      >
        {shortcut.customer_type?.replace('_', ' ')} &middot; {shortcut.payment_mode}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: colors.fg, marginTop: 'auto' }}>
        ₹{Number(shortcut.price).toLocaleString('en-IN')} / {shortcut.unit}
      </div>
    </div>
  );
});

export default ShortcutCard;
