'use client';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    JOB_DESCRIPTION_PRESET_OPTIONS,
    JOB_TITLE_PRESET_OPTIONS,
    RESPONSIBILITY_SECTIONS,
    formatMmDdYyyyInput,
    hostJobFieldInp,
    hostJobFieldLbl,
    isoToMmDdYyyy,
    clampIsoDateToMin,
    parseMmDdYyyyToIso,
    todayIsoDateLocal,
} from '@/lib/hostJobPostingForm';
import { useAnchoredDropdownMenu } from '@/hooks/useAnchoredDropdownMenu';

function CalendarIcon() {
    return (<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="3" width="12" height="10" rx="1.5" stroke="#6B7280" strokeWidth="1.2"/>
      <path d="M4.5 1.5v2M9.5 1.5v2M1 6h12" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>);
}

function ChevronDownButton({ ariaLabel, expanded, onClick, top }: {
    ariaLabel: string;
    expanded: boolean;
    onClick: () => void;
    top?: number | string;
}) {
    return (<button type="button" aria-expanded={expanded} aria-label={ariaLabel} onClick={onClick} style={{
            position: 'absolute',
            right: 2,
            top: top ?? '50%',
            transform: top == null ? 'translateY(-50%)' : undefined,
            width: 36,
            height: 34,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            color: '#0B0F1F',
            touchAction: 'manipulation',
        }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>);
}

const presetMenuStyle: React.CSSProperties = {
    position: 'fixed',
    background: '#fff',
    border: '1px solid #D0D5DD',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 100020,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
};

const presetItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    border: 'none',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    color: '#0B0F1F',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    touchAction: 'manipulation',
};

function usePresetDropdownMenu(
    open: boolean,
    setOpen: (open: boolean) => void,
    wrapRef: React.RefObject<HTMLDivElement | null>,
    menuRef: React.RefObject<HTMLDivElement | null>,
    preferredMaxHeight: number,
) {
    return useAnchoredDropdownMenu(open, setOpen, wrapRef, menuRef, preferredMaxHeight);
}

export function MmDdYyyyDateField({ value, onChange, inputStyle, minIso = todayIsoDateLocal(), }: {
    value: string;
    onChange: (value: string) => void;
    inputStyle?: React.CSSProperties;
    /** Earliest selectable date (YYYY-MM-DD). Defaults to today. */
    minIso?: string;
}) {
    const pickerRef = useRef<HTMLInputElement>(null);
    const isoValue = parseMmDdYyyyToIso(value);
    function commitFormatted(formatted: string) {
        const iso = parseMmDdYyyyToIso(formatted);
        if (iso && minIso) {
            const clamped = clampIsoDateToMin(iso, minIso);
            if (clamped !== iso) {
                onChange(isoToMmDdYyyy(clamped));
                return;
            }
        }
        onChange(formatted);
    }
    function openCalendar() {
        const el = pickerRef.current;
        if (!el)
            return;
        try {
            el.showPicker();
        }
        catch {
            el.click();
        }
    }
    const base = inputStyle ?? hostJobFieldInp;
    return (<div className="host-job-date-field" style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <input type="text" className="host-job-date-text" inputMode="numeric" autoComplete="off" placeholder="MM-DD-YYYY" pattern="[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}" title="MM-DD-YYYY" style={{
            ...base,
            paddingRight: 40,
            width: '100%',
            boxSizing: 'border-box',
        }} value={value} onChange={(e) => commitFormatted(formatMmDdYyyyInput(e.target.value))}/>
      <button type="button" className="host-job-date-trigger" aria-label="Open calendar" onClick={openCalendar} style={{
            position: 'absolute',
            right: 2,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 36,
            height: 34,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
        }}>
        <CalendarIcon />
      </button>
      <input ref={pickerRef} className="host-job-date-picker" type="date" tabIndex={-1} aria-label="Choose date" min={minIso} value={isoValue} onChange={(e) => {
            const iso = e.target.value;
            if (!iso) {
                onChange('');
                return;
            }
            const clamped = minIso ? clampIsoDateToMin(iso, minIso) : iso;
            onChange(isoToMmDdYyyy(clamped));
        }} style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 44,
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            border: 'none',
            padding: 0,
            margin: 0,
        }}/>
    </div>);
}

export function HostJobTitleField({ value, onChange, inputStyle, labelStyle, }: {
    value: string;
    onChange: (value: string) => void;
    inputStyle?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const menuBox = usePresetDropdownMenu(open, setOpen, wrapRef, menuRef, 260);
    const base = inputStyle ?? hostJobFieldInp;
    const lbl = labelStyle ?? hostJobFieldLbl;
    return (<div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={lbl}>Job Title *</label>
      <div style={{ position: 'relative' }}>
        <input style={{ ...base, paddingRight: 40 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Choose a suggested title or type a custom one"/>
        <ChevronDownButton ariaLabel="Open suggested job titles" expanded={open} onClick={() => setOpen((v) => !v)}/>
      </div>
      {open && menuBox ? createPortal(<div ref={menuRef} data-anchored-dropdown className="anchored-dropdown-menu host-job-preset-dropdown" style={{
                ...presetMenuStyle,
                left: menuBox.left,
                top: menuBox.top,
                width: menuBox.width,
                maxHeight: menuBox.maxHeight,
            }}>
          {JOB_TITLE_PRESET_OPTIONS.map((t) => (<button key={t} type="button" onClick={() => {
                onChange(t);
                setOpen(false);
            }} style={presetItemStyle} onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F5F6FF';
            }} onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
            }}>
              {t}
            </button>))}
        </div>, document.body) : null}
    </div>);
}

export function HostJobDescriptionField({ value, onChange, inputStyle, labelStyle, }: {
    value: string;
    onChange: (value: string) => void;
    inputStyle?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const menuBox = usePresetDropdownMenu(open, setOpen, wrapRef, menuRef, 280);
    const base = inputStyle ?? hostJobFieldInp;
    const lbl = labelStyle ?? hostJobFieldLbl;
    return (<div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={lbl}>Job Description</label>
      <div style={{ position: 'relative' }}>
        <textarea style={{
                ...base,
                height: 90,
                resize: 'none',
                paddingRight: 40,
            } as React.CSSProperties} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Describe the role…"/>
        <ChevronDownButton ariaLabel="Open description templates" expanded={open} onClick={() => setOpen((v) => !v)} top={10}/>
      </div>
      {open && menuBox ? createPortal(<div ref={menuRef} data-anchored-dropdown className="anchored-dropdown-menu host-job-preset-dropdown" style={{
                ...presetMenuStyle,
                left: menuBox.left,
                top: menuBox.top,
                width: menuBox.width,
                maxHeight: menuBox.maxHeight,
            }}>
          {JOB_DESCRIPTION_PRESET_OPTIONS.map((label) => (<button key={label} type="button" onClick={() => {
                onChange(label);
                setOpen(false);
            }} style={presetItemStyle} onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F5F6FF';
            }} onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
            }}>
              {label}
            </button>))}
        </div>, document.body) : null}
    </div>);
}

export function HostKeyResponsibilitiesField({ respBySection, respCustom, onToggle, onCustomChange, inputStyle, labelStyle, }: {
    respBySection: Record<string, Set<string>>;
    respCustom: string;
    onToggle: (sectionKey: string, optionId: string) => void;
    onCustomChange: (value: string) => void;
    inputStyle?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
}) {
    const base = inputStyle ?? hostJobFieldInp;
    const lbl = labelStyle ?? hostJobFieldLbl;
    return (<div className="host-job-resp-field">
      <label style={lbl}>Key Responsibilities</label>
      <div className="host-job-resp-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {RESPONSIBILITY_SECTIONS.map((section) => {
            const selected = respBySection[section.key] ?? new Set<string>();
            return (<div key={section.key} className="host-job-resp-block">
              <div className="host-job-resp-heading" style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: 8,
                }}>
                {section.title}:
              </div>
              <div className="host-job-resp-options" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.options.map((opt) => (<label key={opt.id} className="host-job-resp-check" style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 10,
                        fontSize: 13,
                        color: '#374151',
                        cursor: 'pointer',
                        lineHeight: 1.35,
                    }}>
                  <input type="checkbox" checked={selected.has(opt.id)} onChange={() => onToggle(section.key, opt.id)} style={{
                            width: 16,
                            height: 16,
                            marginTop: 2,
                            flexShrink: 0,
                            accentColor: '#1C32D2',
                        }}/>
                  <span className="host-job-resp-check-label">{opt.label}</span>
                </label>))}
              </div>
            </div>);
        })}
        <div className="host-job-resp-block">
          <div className="host-job-resp-heading" style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#111827',
                marginBottom: 8,
            }}>
            Custom
          </div>
          <textarea style={{
                ...base,
                minHeight: 56,
                resize: 'vertical',
            } as React.CSSProperties} value={respCustom} onChange={(e) => onCustomChange(e.target.value)} placeholder="Other responsibilities (one per line)"/>
        </div>
      </div>
    </div>);
}
