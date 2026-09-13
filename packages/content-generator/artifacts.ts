import { parseLesson, type LessonSpec } from '@learn-anything/lesson-schema';

export type LessonArtifacts = {
  lesson: LessonSpec;
  lessonJson: string;
  captionsVtt: string;
  resources: { audio: string; captions?: string; handwritingFont?: string };
};

const stamp = (time: number) => {
  const milliseconds = Math.round(time * 1000);
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
};

// The only hand-off to the player is versioned data plus media references.
// This serializer does not encode/join audio or store artifacts. The full
// compileLessonDraft entry performs audio work; hosts still own storage.
export function createLessonArtifacts(input: unknown): LessonArtifacts {
  const lesson = parseLesson(input);
  const narration = lesson.narration;
  for (let index = 0; index < narration.length; index++) {
    if (narration[index].at >= (narration[index + 1]?.at ?? lesson.duration))
      throw new Error('字幕片段必须有正时长。');
  }
  return {
    lesson,
    lessonJson: JSON.stringify(lesson, null, 2) + '\n',
    captionsVtt:
      'WEBVTT\n\n' +
      narration
        .map(
          (cue, index) =>
            `${index + 1}\n${stamp(cue.at)} --> ${stamp(narration[index + 1]?.at ?? lesson.duration)}\n${cue.text
              .replace(/[\r\n]+/g, ' ')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')}\n`,
        )
        .join('\n'),
    resources: {
      audio: lesson.audio,
      ...(lesson.captions ? { captions: lesson.captions } : {}),
      ...(lesson.handwriting
        ? { handwritingFont: lesson.handwriting.fontUrl }
        : {}),
    },
  };
}

// Legacy extension point retained for compatibility. New AI material generation
// lives in lesson-draft-generator; shared draft formats belong to lesson-schema.
export interface DraftGenerator<Input, Draft> {
  generate(input: Input, options?: { signal?: AbortSignal }): Promise<Draft>;
}
