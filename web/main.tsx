import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  CircleStop,
  Code2,
  Download,
  LoaderCircle,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import './styles.css';

type SetupStatus = {
  model: boolean;
  speech: boolean;
  ffmpeg: boolean;
  ready: boolean;
};
type JobPhase =
  | 'queued'
  | 'prepare'
  | 'draft'
  | 'compile'
  | 'player'
  | 'complete'
  | 'error'
  | 'cancelled';
type JobSnapshot = {
  id: string;
  phase: JobPhase;
  progress: number;
  message: string;
  viewerUrl?: string;
  output?: string;
  duration?: number;
};

const samples = [
  '二分查找为什么每次能排除一半？',
  '水循环是如何发生的？',
  '为什么水加热后温度会变化？',
];
const steps: { phase: JobPhase; label: string }[] = [
  { phase: 'prepare', label: '检查环境' },
  { phase: 'draft', label: '生成材料' },
  { phase: 'compile', label: '编译课程' },
  { phase: 'player', label: '准备播放' },
];
const order: Record<JobPhase, number> = {
  queued: 0,
  prepare: 1,
  draft: 2,
  compile: 3,
  player: 4,
  complete: 5,
  error: -1,
  cancelled: -1,
};
const terminal = new Set<JobPhase>(['complete', 'error', 'cancelled']);

function StatusItem({ ready, children }: { ready: boolean; children: string }) {
  return (
    <li className={ready ? 'setup-item is-ready' : 'setup-item'}>
      <span className="setup-icon" aria-hidden="true">
        {ready ? <Check /> : <CircleAlert />}
      </span>
      <span>{children}</span>
      <strong>{ready ? '已就绪' : '待配置'}</strong>
    </li>
  );
}

function App() {
  const [topic, setTopic] = useState(samples[0]);
  const [audience, setAudience] = useState('没有相关基础的普通学习者');
  const [segmentCount, setSegmentCount] = useState(6);
  const [duration, setDuration] = useState(90);
  const [confirmed, setConfirmed] = useState(false);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState(false);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [submitError, setSubmitError] = useState('');
  const source = useRef<EventSource | null>(null);

  const loadSetup = async () => {
    setSetupError(false);
    try {
      const response = await fetch('api/status');
      if (!response.ok) throw new Error();
      setSetup((await response.json()) as SetupStatus);
    } catch {
      setSetupError(true);
    }
  };

  useEffect(() => {
    let active = true;
    void fetch('api/status')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<SetupStatus>;
      })
      .then((status) => {
        if (active) setSetup(status);
      })
      .catch(() => {
        if (active) setSetupError(true);
      });
    return () => {
      active = false;
      source.current?.close();
    };
  }, []);

  const follow = (id: string) => {
    source.current?.close();
    let finished = false;
    const events = new EventSource(`api/jobs/${id}/events`);
    source.current = events;
    events.addEventListener('status', (event) => {
      const snapshot = JSON.parse((event as MessageEvent).data) as JobSnapshot;
      setJob(snapshot);
      if (terminal.has(snapshot.phase)) {
        finished = true;
        events.close();
      }
    });
    events.onerror = () => {
      events.close();
      if (!finished)
        setJob((current) =>
          current
            ? {
                ...current,
                phase: 'error',
                progress: 100,
                message: '进度连接已中断，请检查启动 Web Demo 的终端。',
              }
            : current,
        );
    };
  };

  const start = async (mode: 'demo' | 'generate') => {
    setSubmitError('');
    if (mode === 'generate' && !topic.trim()) {
      setSubmitError('请先填写想学习的主题。');
      document.getElementById('topic')?.focus();
      return;
    }
    try {
      const response = await fetch('api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'demo'
            ? { mode }
            : {
                mode,
                topic,
                audience,
                segmentCount,
                targetDurationSeconds: duration,
                confirmExternalRequest: confirmed,
              },
        ),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id)
        throw new Error(result.error ?? '无法创建课程任务。');
      setJob({
        id: result.id,
        phase: 'queued',
        progress: 2,
        message: mode === 'demo' ? '正在载入内置示例…' : '任务已创建…',
      });
      follow(result.id);
      requestAnimationFrame(() =>
        document.getElementById('progress')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        }),
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : '无法创建课程任务。',
      );
    }
  };

  const cancel = async () => {
    if (!job || terminal.has(job.phase)) return;
    await fetch(`api/jobs/${job.id}`, { method: 'DELETE' }).catch(
      () => undefined,
    );
  };

  const running = Boolean(job && !terminal.has(job.phase));
  const canGenerate = Boolean(setup?.ready && confirmed && !running);

  return (
    <div className="site-shell">
      <header className="topbar">
        <div className="brand" aria-label="learnAnything">
          <span className="brand-mark" aria-hidden="true">
            <Sparkles />
          </span>
          <span>learnAnything</span>
          <small>LOCAL LAB</small>
        </div>
        <a
          className="github-link"
          href="https://github.com/AmakitaCastle/learn-anything"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 aria-hidden="true" />
          <span>GitHub</span>
          <ArrowUpRight aria-hidden="true" />
        </a>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span aria-hidden="true" />
              OPEN-SOURCE AI CLASSROOM
            </p>
            <h1 id="page-title">
              把一个问题，
              <em>变成一堂会动的课。</em>
            </h1>
            <p className="hero-lead">
              输入想学的主题，在本机生成语音、动态板书和概念动画。密钥留在本地，课程也留在本地。
            </p>
            <div className="hero-proof" aria-label="产品特点">
              <span>语音主时钟</span>
              <span>确定性播放</span>
              <span>开放协议</span>
            </div>
          </div>

          <section
            className="generator-card"
            id="generator"
            aria-labelledby="generator-title"
          >
            <div className="card-heading">
              <span className="step-number">01</span>
              <div>
                <p>CREATE A LESSON</p>
                <h2 id="generator-title">今天想弄懂什么？</h2>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void start('generate');
              }}
            >
              <div className="field">
                <div className="field-label">
                  <label htmlFor="topic">课程主题</label>
                  <span>{Array.from(topic).length}/200</span>
                </div>
                <textarea
                  id="topic"
                  value={topic}
                  maxLength={200}
                  rows={3}
                  disabled={running}
                  onChange={(event) => setTopic(event.target.value)}
                  aria-describedby={submitError ? 'form-error' : undefined}
                />
              </div>

              <div className="sample-list" aria-label="示例主题">
                {samples.map((sample) => (
                  <button
                    type="button"
                    key={sample}
                    disabled={running}
                    onClick={() => setTopic(sample)}
                  >
                    {sample.replace('？', '')}
                  </button>
                ))}
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="audience">适合谁学</label>
                  <select
                    id="audience"
                    value={audience}
                    disabled={running}
                    onChange={(event) => setAudience(event.target.value)}
                  >
                    <option>没有相关基础的普通学习者</option>
                    <option>刚开始接触这个主题的学生</option>
                    <option>了解基础、希望建立直觉的学习者</option>
                  </select>
                </div>
                <div className="field compact-field">
                  <label htmlFor="duration">目标时长</label>
                  <select
                    id="duration"
                    value={duration}
                    disabled={running}
                    onChange={(event) =>
                      setDuration(Number(event.target.value))
                    }
                  >
                    <option value={60}>约 1 分钟</option>
                    <option value={90}>约 1.5 分钟</option>
                    <option value={120}>约 2 分钟</option>
                  </select>
                </div>
                <div className="field compact-field">
                  <label htmlFor="segments">讲解段落</label>
                  <select
                    id="segments"
                    value={segmentCount}
                    disabled={running}
                    onChange={(event) =>
                      setSegmentCount(Number(event.target.value))
                    }
                  >
                    <option value={4}>4 段</option>
                    <option value={6}>6 段</option>
                    <option value={8}>8 段</option>
                  </select>
                </div>
              </div>

              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={running}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  我确认本次生成会调用已配置的文本模型和语音服务，可能产生费用。
                </span>
              </label>

              {submitError ? (
                <p className="form-error" id="form-error" role="alert">
                  <CircleAlert aria-hidden="true" />
                  {submitError}
                </p>
              ) : null}

              <div className="form-actions">
                <button
                  className="primary-action"
                  type="submit"
                  disabled={!canGenerate}
                >
                  {running ? (
                    <LoaderCircle className="spin" aria-hidden="true" />
                  ) : (
                    <Sparkles aria-hidden="true" />
                  )}
                  {running ? '正在生成' : '生成一堂课'}
                  <ArrowUpRight aria-hidden="true" />
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={running}
                  onClick={() => void start('demo')}
                >
                  <Play aria-hidden="true" />
                  先看示例
                </button>
              </div>
            </form>

            <div className="setup-panel" aria-live="polite">
              <div className="setup-title">
                <span>本机环境</span>
                <button
                  type="button"
                  onClick={() => void loadSetup()}
                  aria-label="重新检查本机环境"
                >
                  <RefreshCw aria-hidden="true" />
                </button>
              </div>
              {setupError ? (
                <p className="setup-error" role="alert">
                  无法检查环境，请查看启动终端。
                </p>
              ) : setup ? (
                <ul>
                  <StatusItem ready={setup.model}>文本模型</StatusItem>
                  <StatusItem ready={setup.speech}>豆包语音</StatusItem>
                  <StatusItem ready={setup.ffmpeg}>FFmpeg</StatusItem>
                </ul>
              ) : (
                <p className="setup-loading">正在检查，不会调用付费服务…</p>
              )}
            </div>
          </section>
        </section>

        <section className="workflow" aria-labelledby="workflow-title">
          <div className="section-heading">
            <p>ONE SHARED TIMELINE</p>
            <h2 id="workflow-title">不是把文稿塞进播放器。</h2>
          </div>
          <div className="workflow-grid">
            <article>
              <span>01</span>
              <BookOpen aria-hidden="true" />
              <h3>组织讲解</h3>
              <p>模型生成受约束的课程材料，不执行任意页面或脚本。</p>
            </article>
            <article>
              <span>02</span>
              <Sparkles aria-hidden="true" />
              <h3>编译课堂</h3>
              <p>真实语音时间对齐板书和动画，每条轨道共享同一个时钟。</p>
            </article>
            <article>
              <span>03</span>
              <Play aria-hidden="true" />
              <h3>自由回看</h3>
              <p>暂停、拖动、倍速或重播，课堂画面都能确定性恢复。</p>
            </article>
          </div>
        </section>

        {job ? (
          <section
            className={`progress-section is-${job.phase}`}
            id="progress"
            aria-labelledby="progress-title"
          >
            <div className="progress-copy">
              <p>
                {job.phase === 'complete'
                  ? 'READY TO LEARN'
                  : 'BUILDING LESSON'}
              </p>
              <h2 id="progress-title">
                {job.phase === 'complete'
                  ? '这堂课准备好了。'
                  : job.phase === 'error'
                    ? '生成没有完成。'
                    : job.phase === 'cancelled'
                      ? '任务已取消。'
                      : '正在把问题变成课堂。'}
              </h2>
              <p className="progress-message" aria-live="polite">
                {job.message}
              </p>
              {running ? (
                <button
                  className="cancel-action"
                  type="button"
                  onClick={() => void cancel()}
                >
                  <CircleStop aria-hidden="true" />
                  取消生成
                </button>
              ) : null}
            </div>
            <div className="progress-track" aria-label="课程生成进度">
              <div className="progress-bar">
                <span style={{ transform: `scaleX(${job.progress / 100})` }} />
              </div>
              <ol>
                {steps.map((step, index) => {
                  const done =
                    order[job.phase] > index + 1 || job.phase === 'complete';
                  const active = job.phase === step.phase;
                  return (
                    <li
                      className={done ? 'is-done' : active ? 'is-active' : ''}
                      key={step.phase}
                    >
                      <span aria-hidden="true">
                        {done ? <Check /> : index + 1}
                      </span>
                      {step.label}
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        ) : null}

        {job?.phase === 'complete' && job.viewerUrl ? (
          <section className="player-section" aria-labelledby="player-title">
            <div className="player-heading">
              <div>
                <p>LESSON PREVIEW</p>
                <h2 id="player-title">在这里直接试听和回看。</h2>
              </div>
              <div className="player-meta">
                <span>{Math.round(job.duration ?? 0)} 秒</span>
                <span>{job.output}</span>
                {(
                  ['lesson.json', 'captions.vtt', 'narration.mp3'] as const
                ).map((file) => (
                  <a
                    className="asset-link"
                    href={new URL(file, job.viewerUrl).toString()}
                    target="_blank"
                    rel="noreferrer"
                    download
                    key={file}
                  >
                    <Download aria-hidden="true" />
                    {file === 'lesson.json'
                      ? '课程 JSON'
                      : file === 'captions.vtt'
                        ? '字幕 VTT'
                        : '旁白 MP3'}
                  </a>
                ))}
                <a href={job.viewerUrl} target="_blank" rel="noreferrer">
                  新窗口打开
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="player-frame">
              <iframe
                src={job.viewerUrl}
                title="生成课程播放器"
                allow="autoplay"
              />
            </div>
          </section>
        ) : null}
      </main>

      <footer>
        <span>learnAnything / experimental open-source demo</span>
        <span>内容、听感和低置信度词仍需人工复核</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
