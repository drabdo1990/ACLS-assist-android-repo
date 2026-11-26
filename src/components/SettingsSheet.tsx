import { useEffect, useState } from 'react';
import { CloudDownload, RefreshCw, RotateCcw, Send, X } from 'lucide-react';
import { KEEP_OPTIONS, parseEnrollmentCode, type Enrollment, type RetentionMode } from '../engine/prefs';
import { backfillCount, enrollDevice, sendBackfill, sendTestRecord, setRetention, unenrollDevice } from '../engine/service';
import { useCodeStore } from '../engine/store';
import type { SendResult } from '../engine/upload';
import { rejectionMessage, testResultMessage, type Message } from '../engine/uploadLabels';
import {
  applyOnlineUpdate,
  checkForUpdates,
  getInstalledBuildInfo,
  resetToBuiltInVersion,
  type UpdateCheckResult,
  FDROID_BUILD,
} from '../engine/updater';
import { useOutboxState, usePrefsState, useServiceVersion } from '../hooks/useService';
import type { MessageKey } from '../i18n/en';
import { useT } from '../i18n/useT';
import { BigButton } from './ui/BigButton';
import { Chip } from './ui/Chip';
import { HoldButton } from './ui/HoldButton';
import { Panel } from './ui/Panel';
import { TextField } from './ui/TextField';
import { EnrollmentSummary, destinationTail } from './EnrollmentSummary';

const TONE: Record<Message['tone'], string> = { good: 'text-good', warn: 'text-warn', crit: 'text-crit' };

const RETENTION_MODES: Array<[RetentionMode, MessageKey]> = [
  ['all', 'settings.retention.all'],
  ['last', 'settings.retention.last'],
  ['after_upload', 'settings.retention.afterUpload'],
];

/** Full-screen sheet behind the header gear. The clock keeps running underneath. */
export function SettingsSheet({
  open,
  onClose,
  updateCheck,
  onUpdateCheckChange,
}: {
  open: boolean;
  onClose: () => void;
  updateCheck: UpdateCheckResult | null;
  onUpdateCheckChange: (res: UpdateCheckResult | null) => void;
}) {
  const { t, lang } = useT();
  const status = useCodeStore((s) => s.status);
  const prefs = usePrefsState();
  const outbox = useOutboxState();
  useServiceVersion(); // re-render after any write (backfillCount reads storage directly)
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<Enrollment | null>(null);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [testing, setTesting] = useState(false);
  // The raw result is kept (not its text) so the message follows a language switch.
  const [testResult, setTestResult] = useState<SendResult | 'not_enrolled' | null>(null);
  const [backfillDismissed, setBackfillDismissed] = useState(false);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const enrolled = prefs.enrollment;
  const queuedCount = Object.keys(outbox.entries).length;
  const toBackfill = enrolled && !backfillDismissed ? backfillCount() : 0;
  const testMsg = testResult ? testResultMessage(testResult, lang) : null;
  const buildInfo = getInstalledBuildInfo();
  const codeActive = status !== 'idle';

  const runUpdateCheck = async () => {
    setCheckingUpdate(true);
    setApplyError(null);
    try {
      const res = await checkForUpdates();
      onUpdateCheckChange(res);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const runApplyUpdate = async () => {
    if (codeActive || updateCheck?.status !== 'update_available') return;
    setApplyingUpdate(true);
    setApplyError(null);
    try {
      const res = await applyOnlineUpdate(updateCheck);
      if (!res.ok) setApplyError(res.reason);
    } finally {
      setApplyingUpdate(false);
    }
  };

  const checkCode = () => {
    const e = parseEnrollmentCode(code);
    setCodeInvalid(!e);
    setPending(e);
  };
  const confirmEnroll = () => {
    if (!pending) return;
    enrollDevice(pending);
    setPending(null);
    setCode('');
    setTestResult(null);
    setBackfillDismissed(false);
  };
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await sendTestRecord());
    } finally {
      setTesting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t('settings.title')} className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="safe-top sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <h2 className="text-base font-bold text-ink">{t('settings.title')}</h2>
          <button
            type="button"
            aria-label={t('settings.close')}
            onClick={onClose}
            className="touch-hit ms-auto flex h-10 w-10 items-center justify-center rounded-full border border-line text-mute"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pt-3 pb-appbar">
        {FDROID_BUILD ? null : (
        <Panel
          title={t('settings.update.title')}
          icon={CloudDownload}
          accent={updateCheck?.status === 'update_available' ? 'cyber' : 'none'}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink">
            <span className="font-mono font-semibold">
              {t('settings.update.current', { version: buildInfo.version, commit: buildInfo.shortCommit })}
            </span>
            {buildInfo.isOtaActive ? (
              <span className="rounded-full border border-good/60 bg-good/15 px-2 py-0.5 text-[10px] font-bold text-good">
                {t('settings.update.otaTag')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-[11px] text-mute">
            {t('settings.update.repo', { repo: buildInfo.repo, branch: buildInfo.branch })}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <BigButton
              variant="neutral"
              icon={RefreshCw}
              label={checkingUpdate ? t('settings.update.checking') : t('settings.update.check')}
              disabled={checkingUpdate || applyingUpdate}
              onClick={runUpdateCheck}
            />
            {updateCheck?.status === 'update_available' ? (
              <BigButton
                variant="cyber"
                icon={CloudDownload}
                label={applyingUpdate ? t('settings.update.applying') : t('settings.update.apply')}
                disabled={codeActive || applyingUpdate}
                onClick={runApplyUpdate}
              />
            ) : null}
          </div>

          {codeActive ? (
            <p role="note" className="mt-2 text-xs font-semibold text-warn">
              {t('settings.update.activeCode')}
            </p>
          ) : null}

          {updateCheck?.status === 'up_to_date' ? (
            <p role="status" className="mt-2 text-xs font-bold text-good">
              {t('settings.update.upToDate', { commit: updateCheck.shortCommit })}
            </p>
          ) : null}

          {updateCheck?.status === 'update_available' ? (
            <div role="status" className="mt-2 rounded-xl border border-cyber/50 bg-cyber/10 p-2.5 text-xs">
              <p className="font-bold text-cyber">
                {t('settings.update.available', { commit: updateCheck.shortCommit })}
              </p>
              {updateCheck.commitMessage ? (
                <p className="mt-1 font-mono text-[11px] text-ink">{updateCheck.commitMessage}</p>
              ) : null}
            </div>
          ) : null}

          {updateCheck?.status === 'building' ? (
            <div role="status" className="mt-2 rounded-xl border border-warn/50 bg-warn/10 p-2.5 text-xs">
              <p className="font-bold text-warn">
                {t('settings.update.building', { commit: updateCheck.shortCommit })}
              </p>
              {updateCheck.commitMessage ? (
                <p className="mt-1 font-mono text-[11px] text-ink">{updateCheck.commitMessage}</p>
              ) : null}
            </div>
          ) : null}

          {updateCheck?.status === 'offline' ? (
            <p role="status" className="mt-2 text-xs font-semibold text-warn">
              {t('settings.update.offline')}
            </p>
          ) : null}

          {updateCheck?.status === 'error' ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-crit">
              {t('settings.update.error')}
            </p>
          ) : null}

          {applyError ? (
            <p role="alert" className="mt-2 text-xs font-bold text-crit">
              {t('settings.update.applyError', { reason: applyError })}
            </p>
          ) : null}

          {buildInfo.isNativeAndroid && buildInfo.isOtaActive ? (
            <div className="mt-3 border-t border-line pt-3">
              <HoldButton
                variant="outline"
                icon={RotateCcw}
                label={t('settings.update.resetBuiltIn')}
                sub={t('settings.update.resetBuiltInSub')}
                durationMs={2000}
                disabled={codeActive || applyingUpdate}
                onComplete={resetToBuiltInVersion}
              />
            </div>
          ) : null}
        </Panel>
        )}

        <Panel title={t('settings.upload.title')} accent={enrolled ? 'cyber' : 'none'}>
          {enrolled ? (
            <>
              <p className="text-sm text-ink">
                {t('settings.upload.enrolled')}
                {enrolled.unit ? ` · ${enrolled.unit}` : ''} ·{' '}
                <span dir="ltr" className="font-mono">
                  {destinationTail(enrolled.url)}
                </span>
              </p>
              <p className="mt-1 text-xs text-mute">
                {queuedCount ? t('settings.upload.waiting', { n: queuedCount }) : t('settings.upload.nothingWaiting')}
              </p>
              {outbox.lastRejection ? (
                <p role="alert" className="mt-1 text-xs font-bold text-crit">
                  {rejectionMessage(outbox.lastRejection.error, lang)}
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <BigButton
                  variant="neutral"
                  icon={Send}
                  label={testing ? t('settings.upload.sending') : t('settings.upload.sendTest')}
                  disabled={testing}
                  onClick={runTest}
                />
                <HoldButton
                  variant="outline"
                  label={t('settings.upload.stop')}
                  sub={t('settings.upload.stopSub')}
                  durationMs={2000}
                  onComplete={unenrollDevice}
                />
              </div>
              {testMsg ? (
                <p role="status" className={`mt-2 text-xs font-bold ${TONE[testMsg.tone]}`}>
                  {testMsg.text}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-mute">{t('settings.upload.off')}</p>
          )}
        </Panel>

        {toBackfill > 0 ? (
          <Panel title={t('settings.backfill.title')} accent="cyber">
            <p className="text-sm text-ink">{t('settings.backfill.ask', { n: toBackfill })}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <BigButton variant="cyber" label={t('settings.backfill.send')} onClick={() => sendBackfill()} />
              <BigButton variant="outline" label={t('settings.backfill.notNow')} onClick={() => setBackfillDismissed(true)} />
            </div>
          </Panel>
        ) : null}

        <Panel title={t('settings.enroll.title')}>
          <TextField
            label={t('settings.enroll.field')}
            value={code}
            onChange={(v) => {
              setCode(v);
              setCodeInvalid(false);
              setPending(null);
            }}
            placeholder={t('settings.enroll.placeholder')}
            mono
            dir="ltr"
            error={codeInvalid ? t('settings.enroll.invalid') : null}
          />
          {pending ? (
            <div className="mt-2 rounded-xl border border-cyber/60 bg-cyber/10 p-3">
              <EnrollmentSummary enrollment={pending} replacing={enrolled != null} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <BigButton variant="cyber" label={t('enroll.enroll')} onClick={confirmEnroll} />
                <BigButton variant="outline" label={t('enroll.cancel')} onClick={() => setPending(null)} />
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <BigButton variant="neutral" label={t('settings.enroll.check')} disabled={!code.trim()} onClick={checkCode} />
            </div>
          )}
        </Panel>

        <Panel title={t('settings.history.title')}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {RETENTION_MODES.map(([mode, key]) => (
              <Chip key={mode} selected={prefs.retention.mode === mode} onClick={() => setRetention({ ...prefs.retention, mode })}>
                {t(key)}
              </Chip>
            ))}
          </div>
          {prefs.retention.mode === 'last' ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {KEEP_OPTIONS.map((n) => (
                <Chip key={n} selected={prefs.retention.keep === n} onClick={() => setRetention({ ...prefs.retention, keep: n })}>
                  {n}
                </Chip>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-mute">{t('settings.retention.note')}</p>
        </Panel>

        <Panel title={t('settings.device.title')}>
          <p className="text-xs text-mute">
            {t('settings.device.id')}{' '}
            <span dir="ltr" className="selectable font-mono text-ink">
              {prefs.deviceId}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-mute">{t('settings.device.note')}</p>
        </Panel>
      </div>
    </div>
  );
}
