import React from 'react';

// --- Button Component ---
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  style,
  ...props
}) => {
  const getVariantStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'danger':
        return { backgroundColor: '#dc2626', color: '#ffffff', border: 'none' };
      case 'success':
        return { backgroundColor: '#16a34a', color: '#ffffff', border: 'none' };
      case 'secondary':
        return { backgroundColor: '#1f2937', color: '#f9fafb', border: '1px solid #374151' };
      case 'outline':
        return { backgroundColor: 'transparent', color: '#f9fafb', border: '1px solid #374151' };
      case 'ghost':
        return { backgroundColor: 'transparent', color: '#9ca3af', border: 'none' };
      case 'primary':
      default:
        return { backgroundColor: '#1d4ed8', color: '#ffffff', border: 'none' };
    }
  };

  const getSizeStyle = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '4px 10px', fontSize: '12px' };
      case 'lg':
        return { padding: '12px 24px', fontSize: '16px' };
      case 'md':
      default:
        return { padding: '8px 16px', fontSize: '14px' };
    }
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        fontWeight: 600,
        borderRadius: '6px',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        opacity: disabled || isLoading ? 0.6 : 1,
        transition: 'all 0.15s ease-in-out',
        ...getVariantStyle(),
        ...getSizeStyle(),
        ...style
      }}
      {...props}
    >
      {isLoading ? <span>Loading...</span> : children}
    </button>
  );
};

// --- Badge Component ---
export interface BadgeProps {
  status: string;
  label?: string;
  style?: React.CSSProperties;
}

export function getStatusBadgeStyle(status: string): { bg: string; color: string } {
  switch (status.toUpperCase()) {
    case 'ONLINE':
    case 'COMPLETED':
    case 'SUCCESS':
      return { bg: '#14532d', color: '#4ade80' };
    case 'STARTING':
    case 'RUNNING':
    case 'MUTE':
    case 'WARN':
    case 'PENDING':
      return { bg: '#78350f', color: '#fde047' };
    case 'OFFLINE':
    case 'FAILED':
    case 'BAN':
    case 'KICK':
    case 'ERROR':
      return { bg: '#7f1d1d', color: '#f87171' };
    case 'DOCKER_AGENT':
    case 'PTERODACTYL':
    case 'DIRECT_RCON_SSH':
      return { bg: '#1e3a8a', color: '#60a5fa' };
    default:
      return { bg: '#1f2937', color: '#9ca3af' };
  }
}

export const Badge: React.FC<BadgeProps> = ({ status, label, style }) => {
  const badgeStyle = getStatusBadgeStyle(status);
  return (
    <span
      style={{
        backgroundColor: badgeStyle.bg,
        color: badgeStyle.color,
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 'bold',
        display: 'inline-block',
        textTransform: 'uppercase',
        ...style
      }}
    >
      {label || status}
    </span>
  );
};

// --- Card Component ---
export interface CardProps {
  title?: string;
  subtitle?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ title, subtitle, extra, children, style }) => {
  return (
    <div
      style={{
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '8px',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        ...style
      }}
    >
      {(title || extra) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {title && <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f9fafb' }}>{title}</h3>}
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9ca3af' }}>{subtitle}</p>}
          </div>
          {extra && <div>{extra}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

// --- Modal Shell Component ---
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = '500px' }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '8px',
          padding: '24px',
          width: '100%',
          maxWidth,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f9fafb' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: '18px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// --- ConfirmModal Component ---
export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmText = 'Confirm Action',
  confirmVariant = 'danger',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110
      }}
    >
      <div
        style={{
          backgroundColor: '#111827',
          border: confirmVariant === 'danger' ? '1px solid #7f1d1d' : '1px solid #1f2937',
          borderRadius: '8px',
          padding: '24px',
          width: '440px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: confirmVariant === 'danger' ? '#ef4444' : '#3b82f6' }}>
          <span style={{ fontSize: '22px' }}>⚠️</span>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f9fafb' }}>{title}</h3>
        </div>

        <p style={{ margin: 0, fontSize: '14px', color: '#d1d5db', lineHeight: 1.5 }}>{description}</p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={confirmVariant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

// --- Table Component ---
export interface TableProps {
  headers: string[];
  children: React.ReactNode;
}

export const Table: React.FC<TableProps> = ({ headers, children }) => {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #1f2937', borderRadius: '6px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: '#090d16', borderBottom: '1px solid #1f2937', color: '#9ca3af' }}>
            {headers.map((h: string, i: number) => (
              <th key={i} style={{ padding: '12px 14px', fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ color: '#f9fafb' }}>{children}</tbody>
      </table>
    </div>
  );
};

// --- Input Component ---
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, style, ...props }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: 600, color: '#d1d5db' }}>{label}</label>}
      <input
        style={{
          backgroundColor: '#090d16',
          border: error ? '1px solid #ef4444' : '1px solid #1f2937',
          borderRadius: '6px',
          padding: '8px 12px',
          color: '#f9fafb',
          fontSize: '14px',
          outline: 'none',
          ...style
        }}
        {...props}
      />
      {error && <span style={{ fontSize: '12px', color: '#ef4444' }}>{error}</span>}
    </div>
  );
};

// --- Select Component ---
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, style, ...props }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: 600, color: '#d1d5db' }}>{label}</label>}
      <select
        style={{
          backgroundColor: '#090d16',
          border: '1px solid #1f2937',
          borderRadius: '6px',
          padding: '8px 12px',
          color: '#f9fafb',
          fontSize: '14px',
          outline: 'none',
          ...style
        }}
        {...props}
      >
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
