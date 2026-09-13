// Host orchestration: the three business modules remain independent.
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  generateLessonDraft,
  importLessonDraft,
  parseLessonBrief,
  type LessonBrief,
  type LessonDraftProvider,
} from '@learn-anything/lesson-draft-generator';
import {
  compileLessonDraft,
  type LessonSpeechProvider,
  type LessonAudioProcessor,
  type LessonHandwritingProvider,
} from '@learn-anything/content-generator';

export type LessonWorkflowInput = { brief: LessonBrief } | { draft: unknown };
export type LessonWorkflowDependencies = {
  provider?: LessonDraftProvider;
  speech: LessonSpeechProvider;
  audio: LessonAudioProcessor;
  handwriting?: LessonHandwritingProvider | false;
  signal?: AbortSignal;
  onStage?: (
    stage: 'prepare' | 'draft' | 'compile' | 'saved',
    directory?: string,
  ) => void;
};
export function topicBrief(
  topic: string,
  options: {
    id?: string;
    audience?: string;
    segmentCount?: number;
    targetDurationSeconds?: number;
  } = {},
): LessonBrief {
  return parseLessonBrief({
    id:
      options.id ??
      `lesson-${createHash('sha256').update(topic).digest('hex').slice(0, 12)}`,
    topic,
    audience: options.audience ?? '没有相关基础的普通学习者',
    segmentCount: options.segmentCount ?? 6,
    targetDurationSeconds: options.targetDurationSeconds ?? 90,
  });
}

export async function runLessonWorkflow(
  input: LessonWorkflowInput,
  options: {
    outputRoot: string;
    output?: string;
    maxRepairAttempts?: number;
  },
  dependencies: LessonWorkflowDependencies,
): Promise<{ directory: string; duration: number }> {
  const brief = 'brief' in input ? parseLessonBrief(input.brief) : undefined;
  const manual = 'draft' in input ? importLessonDraft(input.draft) : undefined;
  if (brief && !dependencies.provider) throw new Error('模型配置缺失。');
  const repairs = options.maxRepairAttempts ?? 0;
  if (!Number.isInteger(repairs) || repairs < 0 || repairs > 2)
    throw new Error('材料修复次数无效。');
  const check = () => {
    if (dependencies.signal?.aborted) throw new Error('课程任务已取消。');
  };
  check();
  dependencies.onStage?.('prepare');
  await dependencies.audio.prepare?.(); // Before any model request or paid TTS.
  check();
  const directory = options.output
    ? resolve(options.output)
    : resolve(
        options.outputRoot,
        brief?.id ?? manual!.draft.id,
        `${Date.now()}-${randomUUID().slice(0, 8)}`,
      );
  // Reserve a new directory before billable work. Never overwrite old runs.
  await mkdir(resolve(directory, '..'), { recursive: true });
  await mkdir(directory);
  dependencies.onStage?.('draft', directory);
  const generated =
    manual ??
    (await generateLessonDraft(brief, {
      provider: dependencies.provider!,
      maxRepairAttempts: repairs,
      signal: dependencies.signal,
    }));
  check();
  await writeFile(join(directory, 'lesson.draft.json'), generated.draftJson, {
    flag: 'wx',
  });
  await writeFile(
    join(directory, 'generation.json'),
    JSON.stringify(generated.report, null, 2) + '\n',
    { flag: 'wx' },
  );
  dependencies.onStage?.('compile', directory);
  const compiled = await compileLessonDraft(generated.draft, {
    speech: {
      async synthesize(segment) {
        check();
        const result = await dependencies.speech.synthesize(segment);
        check();
        return result;
      },
    },
    audio: dependencies.audio,
    handwriting: dependencies.handwriting,
    resources: {
      audio: '/lesson-assets/narration.mp3',
      captions: '/lesson-assets/captions.vtt',
    },
  });
  check();
  // A missing lesson.json denotes an incomplete run, never a playable course.
  await writeFile(join(directory, 'narration.mp3'), compiled.audio, {
    flag: 'wx',
  });
  await writeFile(join(directory, 'captions.vtt'), compiled.captionsVtt, {
    flag: 'wx',
  });
  await writeFile(
    join(directory, 'alignment.json'),
    JSON.stringify(compiled.report, null, 2) + '\n',
    { flag: 'wx' },
  );
  if (compiled.handwritingFont)
    await writeFile(
      join(directory, 'handwriting.ttf'),
      compiled.handwritingFont,
      { flag: 'wx' },
    );
  await writeFile(join(directory, 'lesson.json'), compiled.lessonJson, {
    flag: 'wx',
  });
  dependencies.onStage?.('saved', directory);
  return { directory, duration: compiled.lesson.duration };
}

export async function readWorkflowFile(path: string): Promise<unknown> {
  const bytes = await readFile(resolve(path));
  if (bytes.length > 2_000_000) throw new Error('输入文件过长。');
  return JSON.parse(bytes.toString('utf8'));
}
